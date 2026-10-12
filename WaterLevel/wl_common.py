"""Shared helpers for the WaterLevel notebooks (numpy only; torch lives in wl_model.py).

Keep this file next to the notebooks. Layout of the working directory (WL_WORK, default ./work):
    hf/                 snapshot of the HF dataset (videos/, labels.csv, cup.json, processed/)
    frames/vXX/00000.jpg  full-resolution SDR frames at FPS
    cache/vXX.pt        cup-centred crop caches used for training
"""
from __future__ import annotations

import contextlib
import csv
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np

DATASET_REPO = os.environ.get("WL_DATASET", "carlosco/waterlevel-videos")
MODEL_REPO = os.environ.get("WL_MODELS", "carlosco/waterlevel-models")
WORK = Path(os.environ.get("WL_WORK", "work"))
HF_DIR = WORK / "hf"
FRAMES_DIR = WORK / "frames"
FPS = 5
SEED = 0


def seed_all(seed: int = SEED) -> None:
    import random

    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass


# --------------------------------------------------------------------------- packages


def ensure_pkg(module: str, spec: str, env: dict | None = None, no_deps: bool = False) -> None:
    """Install a git-only package at runtime (molab strips `name @ git+url` from the dependency header)."""
    import importlib.util
    import sys

    if importlib.util.find_spec(module) is not None:
        return
    e = {**os.environ, **(env or {})}
    extra = ["--no-deps"] if no_deps else []
    cmd = [sys.executable, "-m", "uv", "pip", "install", "--python", sys.executable, *extra, spec]
    if subprocess.run(cmd + ["-q"], env=e, capture_output=True).returncode != 0:
        uv = shutil.which("uv")
        cmd = [uv, "pip", "install", "--python", sys.executable, *extra, spec] if uv else [sys.executable, "-m", "pip", "install", *extra, spec]
        subprocess.run(cmd, env=e, check=True)
    importlib.invalidate_caches()


def env_report() -> str:
    """One-line runtime summary (python + key package versions) to spot molab drift early."""
    import platform
    from importlib import metadata

    def v(n):
        try:
            return metadata.version(n)
        except metadata.PackageNotFoundError:
            return "-"

    names = ("numpy", "scipy", "pillow", "torch", "torchvision", "transformers", "huggingface-hub", "vggt", "sam2")
    pk = " ".join(f"{n}={v(n)}" for n in names)
    try:
        import torch

        cuda = f"cuda={torch.cuda.is_available()}"
    except ImportError:
        cuda = "torch=NOT-IMPORTABLE"
    return f"python={platform.python_version()} {pk} {cuda}"


def ensure_vggt() -> None:
    # vggt pins numpy<2 (requirements: ==1.26.1); numpy 1.26 has no py3.13 wheels (molab runs 3.13),
    # so the source build fails. Install without deps; the notebook header supplies the rest.
    ensure_pkg("vggt", "git+https://github.com/facebookresearch/vggt.git", no_deps=True)
    try:
        import vggt.models.vggt  # noqa: F401
    except ImportError as err:
        raise RuntimeError(f"vggt installed but import failed ({err}); runtime: {env_report()}") from err


def ensure_sam2() -> None:
    ensure_pkg("sam2", "git+https://github.com/facebookresearch/sam2.git", {"SAM2_BUILD_CUDA": "0"})


# --------------------------------------------------------------------------- data


def hf_token() -> str | None:
    return os.environ.get("HF_TOKEN") or None


def pull_dataset(token: str | None = None, include_videos: bool = True) -> Path:
    from huggingface_hub import snapshot_download

    patterns = ["labels.csv", "cup.json", "processed/*", "results/*"]
    if include_videos:
        patterns.append("videos/*")
    snapshot_download(
        repo_id=DATASET_REPO,
        repo_type="dataset",
        local_dir=HF_DIR,
        token=token or hf_token(),
        allow_patterns=patterns,
    )
    return HF_DIR


def push_processed(token: str | None = None) -> None:
    from huggingface_hub import HfApi

    HfApi(token=token or hf_token()).upload_folder(
        repo_id=DATASET_REPO,
        repo_type="dataset",
        folder_path=str(HF_DIR / "processed"),
        path_in_repo="processed",
        commit_message="processed poses and masks",
    )


def push_results(token: str | None = None) -> bool:
    """Upload work/results/*.json to the dataset repo under results/. Never raises (a missing write token is only a warning)."""
    try:
        from huggingface_hub import HfApi

        HfApi(token=token or hf_token()).upload_folder(
            repo_id=DATASET_REPO, repo_type="dataset", folder_path=str(WORK / "results"), path_in_repo="results",
            commit_message="results",
        )
        return True
    except Exception as e:
        print(f"WARNING: could not push results to HF ({type(e).__name__}: {e}). They only exist on this session's disk.")
        return False


def ensure_labels(token: str | None = None) -> list[tuple[str, float]]:
    """labels.csv (+ cup.json) only: enough to list the videos without pulling the whole dataset."""
    if not (HF_DIR / "labels.csv").exists():
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=DATASET_REPO,
            repo_type="dataset",
            local_dir=HF_DIR,
            token=token or hf_token(),
            allow_patterns=["labels.csv", "cup.json"],
        )
    return read_labels()


def read_labels(root: Path = HF_DIR) -> list[tuple[str, float]]:
    """[(stem, grams)] in labels.csv order. That order defines the folds."""
    out = []
    with open(root / "labels.csv", newline="") as f:
        for row in csv.DictReader(f):
            out.append((Path(row["video"]).stem, float(row["grams"])))
    return out


def read_cup(root: Path = HF_DIR) -> dict:
    p = root / "cup.json"
    return json.loads(p.read_text()) if p.exists() else {}


def end_stems(labels: list[tuple[str, float]]) -> list[str]:
    """The empty-most and fullest videos: LOVO on these tests extrapolation."""
    g = sorted(labels, key=lambda t: t[1])
    return [g[0][0], g[-1][0]]


def video_path(stem: str, root: Path = HF_DIR) -> Path:
    cands = sorted((root / "videos").glob(f"{stem}.*"))
    if not cands:
        raise FileNotFoundError(f"no video for {stem}")
    return cands[0]


# --------------------------------------------------------------------------- decoding


def ffmpeg_exe() -> str:
    env = os.environ.get("WL_FFMPEG")
    if env:
        return env
    sys_ff = shutil.which("ffmpeg")
    if sys_ff:  # system builds normally include zscale (needed for HDR tone-mapping)
        return sys_ff
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _has_filter(ff: str, name: str) -> bool:
    out = subprocess.run([ff, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return re.search(rf"\b{name}\b", out) is not None


def probe(path: Path) -> dict:
    ff = ffmpeg_exe()
    text = subprocess.run([ff, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    vline = next((l for l in text.splitlines() if "Video:" in l), "")
    rot = re.search(r"rotation of (-?[\d.]+)", text)
    hdr = re.search(r"arib-std-b67|smpte2084", vline) is not None
    return {
        "codec_line": vline.strip(),
        "rotation": float(rot.group(1)) if rot else 0.0,
        "hdr": hdr,
        "zscale": _has_filter(ff, "zscale"),
    }


_TONEMAP = (
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
    "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
)


def decode_video(stem: str, force: bool = False) -> tuple[Path, dict]:
    """Decode to FPS jpgs at full resolution, rotation applied (ffmpeg autorotate), HDR tone-mapped to SDR."""
    out = FRAMES_DIR / stem
    path = video_path(stem)
    info = probe(path)
    info["tonemapped"] = bool(info["hdr"] and info["zscale"])
    if out.exists() and any(out.glob("*.jpg")) and not force:
        return out, info
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.jpg"):
        f.unlink()
    vf = f"fps={FPS}" + ("," + _TONEMAP if info["tonemapped"] else "")
    subprocess.run(
        [ffmpeg_exe(), "-v", "error", "-i", str(path), "-vf", vf, "-q:v", "2", "-start_number", "0", str(out / "%05d.jpg")],
        check=True,
    )
    return out, info


def frame_files(stem: str) -> list[Path]:
    return sorted((FRAMES_DIR / stem).glob("*.jpg"))


# --------------------------------------------------------------------------- geometry / cup frame


def fit_plane_ransac(pts: np.ndarray, iters: int = 400, thresh: float | None = None, rng=None):
    """Plane (n, d) with n.p + d = 0, unit n, maximising inlier count."""
    rng = rng or np.random.default_rng(SEED)
    if thresh is None:
        thresh = 0.02 * float(np.median(np.linalg.norm(pts - np.median(pts, 0), axis=1)))
    best, best_n = None, -1
    for _ in range(iters):
        a, b, c = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(b - a, c - a)
        nn = np.linalg.norm(n)
        if nn < 1e-12:
            continue
        n /= nn
        d = -n @ a
        cnt = int((np.abs(pts @ n + d) < thresh).sum())
        if cnt > best_n:
            best, best_n = (n, d), cnt
    n, d = best
    inl = pts[np.abs(pts @ n + d) < thresh]  # refit on inliers (SVD)
    c = inl.mean(0)
    n = np.linalg.svd(inl - c, full_matrices=False)[2][-1]
    return n / np.linalg.norm(n), -n @ c, best_n / len(pts)


def ray_plane(o: np.ndarray, d: np.ndarray, n: np.ndarray, dpl: float):
    denom = d @ n
    if abs(denom) < 1e-9:
        return None
    t = -(o @ n + dpl) / denom
    return o + t * d if t > 0 else None


def estimate_cup_frame(R_w2c, t_w2c, K, points, conf, masks, ring_px=(6, 40), min_conf_pct=50.0):
    """All arrays at the VGGT resolution.

    R_w2c (S,3,3), t_w2c (S,3), K (S,3,3), points (S,H,W,3) world, conf (S,H,W), masks (S,H,W) bool.
    Returns dict: A (3,3, rows = x,y,z cup axes in world coords), c (3,) base centre in world coords,
    s (world units per cup height), radius (world units), plane (n, d), diagnostics.
    """
    from scipy.ndimage import binary_dilation

    S, H, W = masks.shape
    cams = -np.einsum("sji,sj->si", R_w2c, t_w2c)  # camera centres in world coordinates
    # 1. table plane from a ring around the cup, cup excluded
    ring_pts = []
    for i in range(S):
        if not masks[i].any():
            continue
        ring = binary_dilation(masks[i], iterations=ring_px[1]) & ~binary_dilation(masks[i], iterations=ring_px[0])
        thr = np.percentile(conf[i][ring], min_conf_pct) if ring.any() else np.inf
        sel = ring & (conf[i] >= thr)
        ring_pts.append(points[i][sel])
    ring_pts = np.concatenate(ring_pts)
    rng = np.random.default_rng(SEED)
    if len(ring_pts) > 200_000:
        ring_pts = ring_pts[rng.choice(len(ring_pts), 200_000, replace=False)]
    n, dpl, inlier_frac = fit_plane_ransac(ring_pts, rng=rng)
    if np.mean((cams @ n) + dpl) < 0:  # +z points from the table towards the cameras
        n, dpl = -n, -dpl

    # 2. base centre from the silhouette bottom, offset by the base radius, median over frames
    centres, radii, tops = [], [], []
    for i in range(S):
        m = masks[i]
        if m.sum() < 50:
            continue
        ys, xs = np.nonzero(m)
        Kinv = np.linalg.inv(K[i])
        Rc2w = R_w2c[i].T
        vb = ys.max()
        band = ys >= vb - max(2, int(0.03 * (vb - ys.min() + 1)))
        ub = float(np.median(xs[band]))
        wpx = float(xs[band].max() - xs[band].min() + 1)
        d = Rc2w @ (Kinv @ np.array([ub, vb, 1.0]))
        d /= np.linalg.norm(d)
        hit = ray_plane(cams[i], d, n, dpl)
        if hit is None:
            continue
        zcam = (R_w2c[i] @ hit + t_w2c[i])[2]
        r = 0.5 * wpx * zcam / K[i][0, 0]
        away = hit - cams[i]
        away -= (away @ n) * n
        away /= np.linalg.norm(away) + 1e-12
        centres.append(hit + r * away)
        radii.append(r)
        vt = ys.min()
        ut = float(np.median(xs[ys <= vt + 2]))
        dt = Rc2w @ (Kinv @ np.array([ut, vt, 1.0]))
        tops.append((cams[i], dt / np.linalg.norm(dt)))
    centres = np.array(centres)
    c = np.median(centres, 0)
    c = c - (c @ n + dpl) * n  # exactly on the plane
    radius = float(np.median(radii))

    # 3. height: closest approach of the top-silhouette rays to the cup axis
    hs = []
    for o, d in tops:
        w0 = o - c
        a, b_, cc = d @ d, d @ n, n @ n
        dd, e = d @ w0, n @ w0
        den = a * cc - b_ * b_
        if abs(den) < 1e-6:
            continue
        hs.append((a * e - b_ * dd) / den)  # parameter along the axis
    hs = np.array(hs)
    med = np.median(hs)
    mad = np.median(np.abs(hs - med)) + 1e-9
    hs = hs[np.abs(hs - med) < 4 * 1.4826 * mad]
    s = float(np.median(hs))
    if s <= 0:
        raise RuntimeError("non-positive cup height; check the mask and the plane")

    # 4. axes: z = plane normal, x towards the first camera (yaw is arbitrary for a round cup)
    x = cams[0] - c
    x -= (x @ n) * n
    x /= np.linalg.norm(x)
    A = np.stack([x, np.cross(n, x), n])
    return dict(
        A=A, c=c, s=s, radius=radius, plane=(n, dpl),
        diag=dict(plane_inlier_frac=inlier_frac, n_frames_used=len(centres), height_spread=float(1.4826 * mad / s),
                  centre_spread=float(np.median(np.linalg.norm(centres - c, axis=1)) / s), radius_units=radius / s),
    )


def cup_poses(R_w2c, t_w2c, frame: dict):
    """Per-frame camera-to-cup rotation (S,3,3) and camera centre (S,3) in cup units."""
    A, c, s = frame["A"], frame["c"], frame["s"]
    cams = -np.einsum("sji,sj->si", R_w2c, t_w2c)
    o = (cams - c) @ A.T / s
    Rc = np.einsum("ij,skj->sik", A, R_w2c)  # A @ R_w2c^T  (camera -> cup)
    return Rc, o


def project(K, Rc, o, pts):
    """Cup-frame points (M,3) -> pixel coordinates (M,2) for one frame; NaN behind the camera."""
    pc = (pts - o) @ Rc  # R_cup->cam = Rc^T, row-vector form
    z = pc[:, 2]
    uv = (pc @ K.T)[:, :2] / np.where(z > 1e-9, z, np.nan)[:, None]
    return uv


def circle_pts(radius: float, z: float, n: int = 64):
    a = np.linspace(0, 2 * np.pi, n)
    return np.stack([radius * np.cos(a), radius * np.sin(a), np.full(n, z)], 1)


# --------------------------------------------------------------------------- metrics


def video_pred(frames: list[float]) -> float:
    return float(np.median(frames))


def summarize(results: dict, labels: list[tuple[str, float]]) -> dict:
    """results: {"folds": {stem: {"true": g, "frames": [...]}}} -> MAEs (grams)."""
    ends = set(end_stems(labels))
    per = {}
    for stem, r in results["folds"].items():
        fr = np.asarray(r["frames"], dtype=float)
        per[stem] = dict(true=r["true"], pred=video_pred(fr), video_mae=abs(video_pred(fr) - r["true"]),
                         frame_mae=float(np.abs(fr - r["true"]).mean()))
    mid = [v["video_mae"] for k, v in per.items() if k not in ends]
    end = [v["video_mae"] for k, v in per.items() if k in ends]
    return dict(per=per, mid_mae=float(np.mean(mid)) if mid else None, end_mae=float(np.mean(end)) if end else None,
                all_mae=float(np.mean([v["video_mae"] for v in per.values()])))


def mean_predictor(labels: list[tuple[str, float]]) -> dict:
    out = {}
    for stem, g in labels:
        tr = [x for s, x in labels if s != stem]
        out[stem] = dict(true=g, frames=[float(np.mean(tr))])
    return {"variant": "train_mean", "folds": out}


def save_results(res: dict, name: str, root: Path | None = None) -> Path:
    root = root or (WORK / "results")
    root.mkdir(parents=True, exist_ok=True)
    p = root / f"{name}.json"
    p.write_text(json.dumps(res))
    return p


def load_results(root: Path | None = None) -> dict:
    root = root or (WORK / "results")
    remote = HF_DIR / "results"  # copies pulled from HF; local files win
    if remote.exists():
        root.mkdir(parents=True, exist_ok=True)
        for p in remote.glob("*.json"):
            if not (root / p.name).exists():
                shutil.copy(p, root / p.name)
    return {p.stem: json.loads(p.read_text()) for p in sorted(root.glob("*.json"))}


# --------------------------------------------------------------------------- run logs


@contextlib.contextmanager
def run_log(stage: str, token: str | None = None):
    """Wrap a notebook stage. On exit, write a markdown log (status, duration, env, notes, traceback) to work/logs/
    and push it to the HF dataset under logs/, so failures can be read without copy-pasting from the notebook.
    Yields a list: append strings to it to include progress notes. Exceptions are re-raised unchanged."""
    import time
    import traceback

    notes: list[str] = []
    t0 = time.time()
    try:
        yield notes
    except Exception:
        _write_log(stage, "error", notes, traceback.format_exc(), time.time() - t0, token)
        raise
    _write_log(stage, "ok", notes, "", time.time() - t0, token)


def _write_log(stage: str, status: str, notes: list[str], tb: str, secs: float, token: str | None) -> None:
    import datetime

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}_{stage}_{status}.md"
    text = "\n".join([
        f"# {stage}: {status}", "", f"- utc: {stamp}", f"- duration: {secs:.0f} s", f"- env: {env_report()}", "",
        *(["## notes", *notes, ""] if notes else []),
        *(["## traceback", "```", tb.rstrip(), "```"] if tb else []),
    ]) + "\n"
    out = WORK / "logs" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    try:
        from huggingface_hub import HfApi

        HfApi(token=token or hf_token()).upload_file(
            path_or_fileobj=str(out), path_in_repo=f"logs/{name}", repo_id=DATASET_REPO, repo_type="dataset",
            commit_message=f"log {stage} {status}",
        )
        print(f"log pushed: logs/{name}")
    except Exception as e:
        print(f"WARNING: could not push log logs/{name} ({type(e).__name__}: {e}); it is only at {out}")
