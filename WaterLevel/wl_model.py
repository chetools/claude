"""Torch side of WaterLevel: GPU crop/ray sampler, ray-conditioned ViT, SIGReg, LeJEPA + fine-tuning loops.

Everything per-pixel (crop jitter, flips, Plucker rays, photometric aug) runs on the GPU from a
small in-memory cache of cup-centred crops, so the 4 CPUs of the molab box are never the bottleneck.
Rays are computed from the same sampling grid as the pixels, so they always match the augmented image.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

import wl_common as C

CACHE_RES = 448
BOX_EXPAND = 1.6  # the cache covers 1.6x the (square) mask bbox
OUT = 224
EVAL_SCALE = 0.75  # fraction of the cache shown at eval = 1.2x the cup bbox
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


# --------------------------------------------------------------------------- cache


def build_cache(stem: str, root: Path | None = None) -> Path:
    """Crop every frame around the cup (box from the poses stage of pipeline.py) and store uint8 tensors + camera data."""
    from PIL import Image

    root = root or (C.HF_DIR / "processed")
    out = C.WORK / "cache" / f"{stem}.pt"
    if out.exists():
        return out
    pz = np.load(root / f"{stem}.npz")
    mz = np.load(root / f"{stem}_mask.npz")["mask"]
    files = C.frame_files(stem)
    files = [files[j] for j in pz["frame_ids"]]
    S = len(files)
    assert S == len(pz["K"]) == len(mz), f"{stem}: {S} frames vs {len(pz['K'])} poses vs {len(mz)} masks; re-run the data and poses stages"
    imgs = torch.empty(S, 3, CACHE_RES, CACHE_RES, dtype=torch.uint8)
    msks = torch.empty(S, 1, CACHE_RES, CACHE_RES, dtype=torch.uint8)
    box = pz["box"]  # (S,3) cx, cy, side in full-res px
    ext = box[:, 2] * BOX_EXPAND
    x0 = box[:, 0] - ext / 2
    y0 = box[:, 1] - ext / 2
    def crop(im, i, resample):
        """Exact (sub-pixel) square crop that may extend past the frame: pad by an integer crop (outside = 0), then
        resample with the box relative to it. PIL refuses resize boxes that start outside the image."""
        X0, Y0 = math.floor(x0[i]), math.floor(y0[i])
        X1, Y1 = math.ceil(x0[i] + ext[i]), math.ceil(y0[i] + ext[i])
        dx, dy = float(x0[i] - X0), float(y0[i] - Y0)
        return im.crop((X0, Y0, X1, Y1)).resize((CACHE_RES, CACHE_RES), resample, box=(dx, dy, dx + float(ext[i]), dy + float(ext[i])))

    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB")
        W, H = im.size
        imgs[i] = torch.from_numpy(np.asarray(crop(im, i, Image.BILINEAR))).permute(2, 0, 1)
        m = Image.fromarray(mz[i].astype(np.uint8) * 255).resize((W, H), Image.NEAREST)
        msks[i, 0] = torch.from_numpy(np.asarray(crop(m, i, Image.BILINEAR)) > 127).to(torch.uint8)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(dict(img=imgs, mask=msks, K=torch.from_numpy(pz["K"]).float(), Rc=torch.from_numpy(pz["Rc"]).float(),
                    o=torch.from_numpy(pz["o"]).float(), x0=torch.from_numpy(x0).float(), y0=torch.from_numpy(y0).float(),
                    ext=torch.from_numpy(ext).float()), out)
    return out


class Sampler:
    """All frames of all videos on the GPU; produces augmented (image, patch-ray) batches."""

    def __init__(self, stems: list[str], device="cuda", patch: int = 16):
        self.stems, self.dev, self.patch = list(stems), device, patch
        parts = [torch.load(build_cache(s)) for s in stems]
        cat = lambda k: torch.cat([p[k] for p in parts]).to(device)
        self.img, self.mask = cat("img"), cat("mask")
        self.K, self.Rc, self.o = cat("K"), cat("Rc"), cat("o")
        self.x0, self.y0, self.ext = cat("x0"), cat("y0"), cat("ext")
        counts = [len(p["K"]) for p in parts]
        self.count = torch.tensor(counts, device=device)
        self.start = torch.cumsum(self.count, 0) - self.count
        self.mean, self.std = MEAN.to(device), STD.to(device)

    def frames_of(self, vi: int) -> torch.Tensor:
        return torch.arange(int(self.start[vi]), int(self.start[vi] + self.count[vi]), device=self.dev)

    def random_frames(self, vids: torch.Tensor) -> torch.Tensor:
        r = torch.rand(len(vids), device=self.dev)
        return self.start[vids] + (r * self.count[vids]).long().minimum(self.count[vids] - 1)

    # ------------------------------------------------------------------ views
    def views(self, idx, scale, shift, flip, train: bool):
        """idx (B,), scale (B,), shift (B,2) in cache-normalised units, flip (B,) bool -> img (B,3,OUT,OUT), rays (B,N,6)."""
        B, dev = len(idx), self.dev
        g = (2 * torch.arange(OUT, device=dev) + 1) / OUT - 1
        gy, gx = torch.meshgrid(g, g, indexing="ij")
        sign = torch.where(flip, -1.0, 1.0).view(B, 1, 1)
        u = sign * scale.view(B, 1, 1) * gx + shift[:, 0].view(B, 1, 1)
        v = scale.view(B, 1, 1) * gy + shift[:, 1].view(B, 1, 1)
        grid = torch.stack([u, v], -1)
        img = F.grid_sample(self.img[idx].float() / 255, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
        msk = F.grid_sample(self.mask[idx].float(), grid, mode="bilinear", padding_mode="zeros", align_corners=False)
        rays = self._rays(idx, u, v)
        if train:
            img = self._augment(img, msk)
        img = (img - self.mean) / self.std
        return img, rays

    def _rays(self, idx, u, v):
        K, Rc, o = self.K[idx], self.Rc[idx], self.o[idx]
        X = self.x0[idx].view(-1, 1, 1) + (u + 1) / 2 * self.ext[idx].view(-1, 1, 1)
        Y = self.y0[idx].view(-1, 1, 1) + (v + 1) / 2 * self.ext[idx].view(-1, 1, 1)
        dc = torch.stack([(X - K[:, 0, 2].view(-1, 1, 1)) / K[:, 0, 0].view(-1, 1, 1),
                          (Y - K[:, 1, 2].view(-1, 1, 1)) / K[:, 1, 1].view(-1, 1, 1), torch.ones_like(X)], -1)
        d = torch.einsum("bij,bhwj->bhwi", Rc, dc)
        d = d / d.norm(dim=-1, keepdim=True)
        az = torch.atan2(o[:, 1], o[:, 0])  # yaw-invariance: put the camera at azimuth 0
        c, s = torch.cos(az), torch.sin(az)
        Rz = torch.stack([torch.stack([c, s, torch.zeros_like(c)], -1), torch.stack([-s, c, torch.zeros_like(c)], -1),
                          torch.stack([torch.zeros_like(c), torch.zeros_like(c), torch.ones_like(c)], -1)], 1)
        d = torch.einsum("bij,bhwj->bhwi", Rz, d)
        o2 = torch.einsum("bij,bj->bi", Rz, o).view(-1, 1, 1, 3).expand_as(d)
        m = torch.cross(o2, d, dim=-1)
        r = torch.cat([d, m], -1).permute(0, 3, 1, 2)  # (B,6,OUT,OUT)
        r = F.avg_pool2d(r, self.patch)
        return r.flatten(2).transpose(1, 2).contiguous()  # (B,N,6)

    def _augment(self, x, msk):
        B, dev = x.shape[0], x.device
        U = lambda lo, hi, *s: torch.empty(B, *s, device=dev).uniform_(lo, hi)
        # randomise the background outside the (dilated) cup mask
        keep = F.max_pool2d(msk, 15, 1, 7).clamp(0, 1)
        noise = F.interpolate(torch.rand(B, 3, 7, 7, device=dev), size=x.shape[-2:], mode="bilinear", align_corners=False)
        solid = torch.rand(B, 3, 1, 1, device=dev).expand_as(x)
        bg = torch.where(torch.rand(B, 1, 1, 1, device=dev) < 0.5, noise, solid)
        use_bg = (torch.rand(B, 1, 1, 1, device=dev) < 0.5).float()
        x = use_bg * (keep * x + (1 - keep) * bg) + (1 - use_bg) * x
        # photometric: gain per channel (white balance), brightness, contrast, saturation, gamma, blur, noise
        x = x * U(0.85, 1.15, 3, 1, 1) * U(0.6, 1.4, 1, 1, 1)
        mu = x.mean((1, 2, 3), keepdim=True)
        x = (x - mu) * U(0.7, 1.3, 1, 1, 1) + mu
        gray = x.mean(1, keepdim=True)
        x = (x - gray) * U(0.6, 1.4, 1, 1, 1) + gray
        x = x.clamp(0, 1) ** U(0.7, 1.4, 1, 1, 1)
        blur = (torch.rand(B, 1, 1, 1, device=dev) < 0.3).float()
        x = blur * F.avg_pool2d(x, 5, 1, 2) + (1 - blur) * x
        x = x + torch.randn_like(x) * U(0, 0.04, 1, 1, 1)
        return x.clamp(0, 1)

    # ------------------------------------------------------------------ convenience
    def train_views(self, idx, lo: float, hi: float):
        B = len(idx)
        sc = torch.empty(B, device=self.dev).uniform_(lo, hi)
        shift = (torch.rand(B, 2, device=self.dev) * 2 - 1) * ((1 - sc) * 0.6).unsqueeze(1)
        flip = torch.rand(B, device=self.dev) < 0.5
        return self.views(idx, sc, shift, flip, train=True)

    def eval_views(self, idx):
        B = len(idx)
        return self.views(idx, torch.full((B,), EVAL_SCALE, device=self.dev), torch.zeros(B, 2, device=self.dev),
                          torch.zeros(B, dtype=torch.bool, device=self.dev), train=False)


# --------------------------------------------------------------------------- model

BACKBONES = ["vit_small_patch16_dinov3.lvd1689m", "vit_small_patch14_dinov2.lvd142m"]


def make_backbone(pretrained: bool):
    import timm

    last = None
    for name in BACKBONES:
        try:
            return timm.create_model(name, pretrained=pretrained, num_classes=0, img_size=OUT), name
        except Exception as e:  # gated or missing weights: fall through to the next backbone
            last = e
            if not pretrained:
                return timm.create_model(name.split(".")[0], pretrained=False, num_classes=0, img_size=OUT), name
    raise RuntimeError(f"no backbone could be loaded: {last}")


class RayPatchEmbed(nn.Module):
    """Wraps the ViT patch embed and adds Linear(6 -> C)(patch-mean Plucker rays) to every patch token."""

    def __init__(self, pe: nn.Module, dim: int):
        super().__init__()
        self.pe = pe
        self.proj = nn.Linear(6, dim)
        nn.init.zeros_(self.proj.weight)
        nn.init.zeros_(self.proj.bias)
        self.rays = None

    def __getattr__(self, name):
        try:
            return super().__getattr__(name)
        except AttributeError:
            return getattr(super().__getattr__("pe"), name)

    def forward(self, x):
        out = self.pe(x)
        if self.rays is None:
            return out
        e = self.proj(self.rays.to(out.dtype))
        return out + e.reshape(out.shape)


class WaterNet(nn.Module):
    def __init__(self, pretrained=True, use_rays=True, proj_dim=128):
        super().__init__()
        self.vit, self.backbone_name = make_backbone(pretrained)
        dim = self.vit.num_features
        self.patch = self.vit.patch_embed.patch_size[0]
        self.vit.patch_embed = RayPatchEmbed(self.vit.patch_embed, dim)
        self.use_rays = use_rays
        self.projector = nn.Sequential(nn.Linear(2 * dim, 1024), nn.BatchNorm1d(1024), nn.GELU(), nn.Linear(1024, proj_dim))
        self.head = nn.Sequential(nn.Linear(2 * dim, 256), nn.GELU(), nn.Dropout(0.1), nn.Linear(256, 1))

    def features(self, img, rays):
        pe = self.vit.patch_embed
        pe.rays = rays if self.use_rays else None
        t = self.vit.forward_features(img)
        pe.rays = None
        k = self.vit.num_prefix_tokens
        return torch.cat([t[:, 0], t[:, k:].mean(1)], 1)

    def project(self, f):
        return self.projector(f)

    def predict(self, f):
        return self.head(f).squeeze(-1)


# --------------------------------------------------------------------------- losses


def sigreg(z: torch.Tensor, num_slices: int = 1024, t_max: float = 3.0, n_pts: int = 17) -> torch.Tensor:
    """Sketched isotropic Gaussian regulariser: Epps-Pulley statistic on random 1-D projections of z (N,D)."""
    z = z.float()
    N, D = z.shape
    A = torch.randn(D, num_slices, device=z.device)
    A = A / A.norm(dim=0, keepdim=True)
    t = torch.linspace(-t_max, t_max, n_pts, device=z.device)
    xt = (z @ A).unsqueeze(-1) * t  # (N,S,T)
    phi = torch.exp(-0.5 * t**2)
    err = (xt.cos().mean(0) - phi) ** 2 + xt.sin().mean(0) ** 2
    return (torch.trapezoid(err * phi, t, dim=-1) * N).mean()


# --------------------------------------------------------------------------- training


@dataclass
class Cfg:
    variant: str = "rays"
    pretrained: bool = True
    use_rays: bool = True
    shuffle_rays: bool = False
    stage1_steps: int = 1500
    stage2_steps: int = 1200
    b1: int = 48
    views: int = 4
    b2: int = 64
    lam1: float = 0.05
    lam2: float = 0.02
    lr1: float = 5e-5
    lr2: float = 1e-4
    lld: float = 0.75
    ema: float = 0.99
    seed: int = 0


VARIANTS = {
    "rays": dict(),
    "no_rays": dict(use_rays=False),
    "shuffled_rays": dict(shuffle_rays=True),
    "scratch": dict(pretrained=False),
}


def _cosine(step, total, warm=0.05):
    w = max(1, int(total * warm))
    return step / w if step < w else 0.5 * (1 + math.cos(math.pi * (step - w) / max(1, total - w)))


def _maybe_shuffle(rays, cfg):
    return rays[torch.randperm(len(rays), device=rays.device)] if cfg.shuffle_rays else rays


def lejepa_pretrain(model, S: Sampler, train_vids: list[int], cfg: Cfg, log=print):
    dev = S.dev
    params = [{"params": model.vit.parameters(), "lr": cfg.lr1}, {"params": model.projector.parameters(), "lr": cfg.lr1 * 10}]
    opt = torch.optim.AdamW(params, weight_decay=0.05)
    base = [g["lr"] for g in opt.param_groups]
    tv = torch.tensor(train_vids, device=dev)
    model.train()
    for step in range(cfg.stage1_steps):
        for g, b in zip(opt.param_groups, base):
            g["lr"] = b * _cosine(step, cfg.stage1_steps)
        vids = tv[torch.randint(len(tv), (cfg.b1,), device=dev)]
        imgs, rays = [], []
        for k in range(cfg.views):
            lo, hi = (0.6, 0.95) if k < 2 else (0.3, 0.5)
            im, ry = S.train_views(S.random_frames(vids), lo, hi)  # each view: its own frame of the same video
            imgs.append(im), rays.append(ry)
        img, ry = torch.cat(imgs), _maybe_shuffle(torch.cat(rays), cfg)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            z = model.project(model.features(img, ry)).float().view(cfg.views, cfg.b1, -1)
        inv = (z.mean(0, keepdim=True) - z).square().mean()
        sig = torch.stack([sigreg(zi) for zi in z]).mean()
        loss = (1 - cfg.lam1) * inv + cfg.lam1 * sig
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 3.0)
        opt.step()
        if step % 100 == 0:
            log(f"  stage1 {step}/{cfg.stage1_steps} loss {loss.item():.4f} inv {inv.item():.4f} sigreg {sig.item():.4f}")


def _llrd_groups(model, lr, decay):
    depth = len(model.vit.blocks)
    groups = {}
    for n, p in model.named_parameters():
        if n.startswith("vit."):
            m = re.match(r"vit\.blocks\.(\d+)\.", n)
            layer = int(m.group(1)) + 1 if m else (depth + 1 if re.match(r"vit\.(norm|fc_norm)", n) else 0)
            scale = decay ** (depth + 1 - layer)
        else:
            scale = 1.0
        groups.setdefault(scale, []).append(p)
    return [{"params": ps, "lr": lr * sc} for sc, ps in groups.items()]


def finetune(model, S: Sampler, train_vids: list[int], grams: dict[int, float], cfg: Cfg, log=print):
    """End-to-end Huber regression on z-scored grams; returns (EMA model, (mean, std))."""
    from torch.optim.swa_utils import AveragedModel, get_ema_multi_avg_fn

    dev = S.dev
    g = torch.tensor([grams[v] for v in train_vids], device=dev)
    mu, sd = g.mean(), g.std().clamp(min=1e-6)
    tgt = {v: (grams[v] - mu) / sd for v in train_vids}
    opt = torch.optim.AdamW(_llrd_groups(model, cfg.lr2, cfg.lld), weight_decay=0.05)
    base = [pg["lr"] for pg in opt.param_groups]
    ema = AveragedModel(model, multi_avg_fn=get_ema_multi_avg_fn(cfg.ema), use_buffers=True)
    tv = torch.tensor(train_vids, device=dev)
    tvals = torch.stack([tgt[v] for v in train_vids]).to(dev).float()
    model.train()
    for step in range(cfg.stage2_steps):
        for pg, b in zip(opt.param_groups, base):
            pg["lr"] = b * _cosine(step, cfg.stage2_steps)
        j = torch.randint(len(tv), (cfg.b2,), device=dev)  # videos sampled uniformly: classes stay balanced
        img, ry = S.train_views(S.random_frames(tv[j]), 0.55, 0.95)
        ry = _maybe_shuffle(ry, cfg)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            f = model.features(img, ry)
            pred = model.predict(f).float()
            z = model.project(f).float()
        loss = F.huber_loss(pred, tvals[j], delta=1.0) + cfg.lam2 * sigreg(z)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 3.0)
        opt.step()
        ema.update_parameters(model)
        if step % 100 == 0:
            log(f"  stage2 {step}/{cfg.stage2_steps} loss {loss.item():.4f}")
    return ema.module, (mu.item(), sd.item())


@torch.no_grad()
def predict_frames(model, S: Sampler, vi: int, mu_sd, cfg: Cfg, bs: int = 128) -> list[float]:
    model.eval()
    idx = S.frames_of(vi)
    out = []
    for i in range(0, len(idx), bs):
        img, ry = S.eval_views(idx[i : i + bs])
        if cfg.shuffle_rays:
            ry = ry.roll(1, 0)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            p = model.predict(model.features(img, ry)).float()
        out.append(p * mu_sd[1] + mu_sd[0])
    return torch.cat(out).tolist()


def run_fold(S: Sampler, labels: list[tuple[str, float]], holdout: str, cfg: Cfg, ckpt_dir: Path | None = None, log=print):
    C.seed_all(cfg.seed)
    stems = S.stems
    grams = {i: dict(labels)[s] for i, s in enumerate(stems)}
    hi = stems.index(holdout)
    train = [i for i in range(len(stems)) if i != hi]
    model = WaterNet(pretrained=cfg.pretrained, use_rays=cfg.use_rays).to(S.dev)
    log(f"[{cfg.variant}] hold out {holdout}; backbone {model.backbone_name}")
    if cfg.stage1_steps > 0:
        lejepa_pretrain(model, S, train, cfg, log)
    ema, mu_sd = finetune(model, S, train, grams, cfg, log)
    frames = predict_frames(ema, S, hi, mu_sd, cfg)
    log(f"[{cfg.variant}] {holdout}: true {grams[hi]:.1f} g, video prediction {float(np.median(frames)):.1f} g")
    if ckpt_dir is not None:
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        p = ckpt_dir / f"{cfg.variant}_{holdout}.pt"
        torch.save(dict(state=ema.state_dict(), mu_sd=mu_sd, cfg=cfg.__dict__, backbone=model.backbone_name), p)
    return dict(true=grams[hi], frames=frames)


def saliency(model, S: Sampler, frame_idx: torch.Tensor) -> torch.Tensor:
    """|d prediction / d pixel|, channel-summed and lightly smoothed: (B,OUT,OUT). A quick water-line sanity check."""
    model.eval()
    img, ry = S.eval_views(frame_idx)
    img.requires_grad_(True)
    with torch.autocast("cuda", dtype=torch.bfloat16):
        p = model.predict(model.features(img, ry)).float().sum()
    p.backward()
    s = img.grad.abs().sum(1, keepdim=True)
    return F.avg_pool2d(s, 7, 1, 3).squeeze(1)
