# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "marimo", "numpy", "scipy", "pillow", "plotly", "huggingface_hub", "imageio-ffmpeg",
#   "torch", "torchvision", "transformers",
#   "einops", "safetensors", "opencv-python-headless", "hydra-core", "iopath", "tqdm",
# ]
#
# [tool.uv.sources]
# torch = { index = "pytorch-cu128" }
# torchvision = { index = "pytorch-cu128" }
#
# [[tool.uv.index]]
# name = "pytorch-cu128"
# url = "https://download.pytorch.org/whl/cu128"
# explicit = true
# ///
import marimo

__generated_with = "0.14.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo

    import wl_common as C

    mo.md(
        "# 01 · poses and the cup frame\n"
        "VGGT gives per-frame K and extrinsics in an arbitrary frame; OWLv2 + SAM 2 give the cup mask; "
        "then everything is expressed in the cup's own frame (z = table normal, origin = base centre, 1 unit = cup height)."
    )
    return C, mo


@app.cell
def _(C, mo):
    try:
        _stems = [s for s, _ in C.read_labels()]
    except FileNotFoundError:
        _stems = []
    pick = mo.ui.multiselect(_stems, value=_stems, label="Videos")
    prompt = mo.ui.text(value="a transparent drinking glass", label="Detector prompt", full_width=True)
    box_override = mo.ui.text(label="Box override on frame 0 (x0,y0,x1,y1 in the 518-px image; blank = auto)", full_width=True)
    run = mo.ui.run_button(label="Run VGGT + masks + cup frame")
    mo.vstack([pick, prompt, box_override, run])
    return box_override, pick, prompt, run


@app.cell
def _():
    import numpy as np
    import torch
    from PIL import Image

    from wl_common import WORK

    VW = 518

    def load_small(files):
        """Resize to VGGT resolution (width 518, height a multiple of 14). Returns (S,3,H,W) float and the per-axis scale."""
        im0 = Image.open(files[0])
        Wf, Hf = im0.size
        H = max(14, round(VW * Hf / Wf / 14) * 14)
        arr = np.stack([np.asarray(Image.open(f).convert("RGB").resize((VW, H), Image.BILINEAR)) for f in files])
        return torch.from_numpy(arr).permute(0, 3, 1, 2).float() / 255, (VW / Wf, H / Hf), (Wf, Hf)

    def run_vggt(imgs):
        from wl_common import ensure_vggt

        ensure_vggt()
        from vggt.models.vggt import VGGT
        from vggt.utils.geometry import unproject_depth_map_to_point_map
        from vggt.utils.pose_enc import pose_encoding_to_extri_intri

        model = VGGT.from_pretrained("facebook/VGGT-1B").cuda().eval()
        x = imgs.cuda()
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
            pred = model(x[None])
        ext, intr = pose_encoding_to_extri_intri(pred["pose_enc"].float(), x.shape[-2:])
        ext, intr = ext[0].cpu().numpy(), intr[0].cpu().numpy()
        pts = unproject_depth_map_to_point_map(pred["depth"][0].float().cpu().numpy(), ext, intr)
        out = (ext, intr, pts.astype(np.float32), pred["depth_conf"][0].float().cpu().numpy())
        del model, pred
        torch.cuda.empty_cache()
        return out

    def detect_box(frame0, prompt, override):
        if override.strip():
            return np.array([float(v) for v in override.split(",")])
        from transformers import Owlv2ForObjectDetection, Owlv2Processor

        name = "google/owlv2-base-patch16-ensemble"
        proc, det = Owlv2Processor.from_pretrained(name), Owlv2ForObjectDetection.from_pretrained(name).cuda().eval()
        im = Image.fromarray((frame0.permute(1, 2, 0).numpy() * 255).astype(np.uint8))
        inp = proc(text=[[prompt]], images=im, return_tensors="pt").to("cuda")
        with torch.no_grad():
            out = det(**inp)
        side = max(im.size)  # OWLv2 pads to a square
        res = proc.post_process_object_detection(out, threshold=0.05, target_sizes=torch.tensor([[side, side]]))[0]
        if len(res["scores"]) == 0:
            raise RuntimeError("detector found nothing; give a box override")
        b = res["boxes"][res["scores"].argmax()].cpu().numpy()
        del det
        torch.cuda.empty_cache()
        return b

    def run_sam2(imgs, box, stem):
        from wl_common import ensure_sam2

        ensure_sam2()
        from sam2.sam2_video_predictor import SAM2VideoPredictor

        d = WORK / "sam" / stem
        d.mkdir(parents=True, exist_ok=True)
        for i, im in enumerate(imgs):
            Image.fromarray((im.permute(1, 2, 0).numpy() * 255).astype(np.uint8)).save(d / f"{i:05d}.jpg", quality=95)
        pred = SAM2VideoPredictor.from_pretrained("facebook/sam2.1-hiera-large")
        masks = np.zeros((len(imgs), imgs.shape[2], imgs.shape[3]), bool)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            st = pred.init_state(video_path=str(d))
            pred.add_new_points_or_box(st, frame_idx=0, obj_id=1, box=np.asarray(box, dtype=np.float32))
            for fi, _ids, logits in pred.propagate_in_video(st):
                masks[fi] = (logits[0, 0] > 0).float().cpu().numpy() > 0
        del pred
        torch.cuda.empty_cache()
        return masks

    return Image, detect_box, load_small, np, run_sam2, run_vggt, torch


@app.cell
def _(C, Image, box_override, detect_box, load_small, mo, np, pick, prompt, run, run_sam2, run_vggt):
    from scipy.ndimage import median_filter, uniform_filter1d

    mo.stop(not run.value, mo.md("Press the button to process."))
    C.pull_dataset()
    cup = C.read_cup()
    out_dir = C.HF_DIR / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = []
    for stem in pick.value:
        C.decode_video(stem)
        files = C.frame_files(stem)
        imgs, (sx, sy), (Wf, Hf) = load_small(files)
        ext, intr, pts, conf = run_vggt(imgs)
        box = detect_box(imgs[0], prompt.value, box_override.value)
        masks = run_sam2(imgs, box, stem)
        R, t = ext[:, :, :3], ext[:, :, 3]
        fr = C.estimate_cup_frame(R, t, intr, pts, conf, masks)
        Rc, o = C.cup_poses(R, t, fr)
        K_full = intr * np.array([1 / sx, 1 / sy, 1.0]).reshape(1, 3, 1)  # scale rows u and v
        # per-frame square crop box in full-res px, smoothed over time
        bx = np.zeros((len(masks), 3))
        for i, m in enumerate(masks):
            ys, xs = np.nonzero(m)
            if len(xs) < 50:
                bx[i] = np.nan
                continue
            bx[i] = [(xs.min() + xs.max()) / 2 / sx, (ys.min() + ys.max()) / 2 / sy, max(xs.max() - xs.min(), ys.max() - ys.min()) / min(sx, sy)]
        for k in range(3):
            col = bx[:, k]
            ok = ~np.isnan(col)
            bx[:, k] = np.interp(np.arange(len(col)), np.nonzero(ok)[0], col[ok])
        bx = uniform_filter1d(median_filter(bx, size=(5, 1), mode="nearest"), size=5, axis=0, mode="nearest")
        # base-point check: projected origin vs the lowest mask pixel, relative to mask height
        offs = []
        for i, m in enumerate(masks):
            ys, _xs = np.nonzero(m)
            if len(ys) < 50:
                continue
            uv = C.project(intr[i], Rc[i], o[i], np.zeros((1, 3)))
            offs.append((uv[0, 1] - ys.max()) / (ys.max() - ys.min() + 1))
        offs = np.array(offs)
        metres = cup.get("inner_height_mm", None)
        np.savez_compressed(out_dir / f"{stem}.npz", K=K_full.astype(np.float32), K_low=intr.astype(np.float32),
                            Rc=Rc.astype(np.float32), o=o.astype(np.float32), box=bx.astype(np.float32),
                            frame_ids=np.arange(len(masks)), wh_full=np.array([Wf, Hf]), wh_low=np.array(masks.shape[2:][::-1]),
                            height_world=fr["s"], radius_units=fr["radius"] / fr["s"],
                            metres_per_unit=(metres / 1000.0) if metres else np.nan)
        np.savez_compressed(out_dir / f"{stem}_mask.npz", mask=masks)
        d = fr["diag"]
        summary.append({"video": stem, "frames": len(masks), "plane inliers": round(d["plane_inlier_frac"], 3),
                        "height spread": round(d["height_spread"], 3), "centre spread": round(d["centre_spread"], 3),
                        "radius (units)": round(d["radius_units"], 3),
                        "base offset median": round(float(np.nanmedian(offs)), 3), "base offset p90": round(float(np.nanpercentile(np.abs(offs), 90)), 3)})
    mo.vstack([mo.md("Processed. Offsets are fractions of mask height (0 is perfect)."), mo.ui.table(summary)])
    return out_dir, summary


@app.cell
def _(C, mo, summary):
    mo.stop(not summary)
    vid = mo.ui.dropdown([r["video"] for r in summary], value=summary[0]["video"], label="Video")
    vid
    return (vid,)


@app.cell
def _(C, Image, mo, np, vid):
    pz = np.load(C.HF_DIR / "processed" / f"{vid.value}.npz")
    mk = np.load(C.HF_DIR / "processed" / f"{vid.value}_mask.npz")["mask"]
    fi = mo.ui.slider(0, len(mk) - 1, value=0, label="Frame", full_width=True)
    fi
    return fi, mk, pz


@app.cell
def _(C, Image, fi, mk, mo, np, pz, vid):
    from PIL import ImageDraw
    from scipy.ndimage import binary_erosion

    _i = fi.value
    _f = Image.open(C.frame_files(vid.value)[_i]).convert("RGB").resize((int(pz["wh_low"][0]), int(pz["wh_low"][1])))
    _a = np.asarray(_f).copy()
    _a[mk[_i] & ~binary_erosion(mk[_i], iterations=2)] = [255, 60, 60]
    _im = Image.fromarray(_a)
    _dr = ImageDraw.Draw(_im)
    _r = float(pz["radius_units"])
    for _pts, _col in [(np.array([[0, 0, 0.0], [0, 0, 1.0]]), (60, 255, 60)), (C.circle_pts(_r, 1.0), (60, 160, 255)), (C.circle_pts(_r, 0.0), (255, 220, 60))]:
        _uv = C.project(pz["K_low"][_i], pz["Rc"][_i], pz["o"][_i], _pts)
        _uv = [tuple(p) for p in _uv if np.all(np.isfinite(p))]
        if len(_uv) > 1:
            _dr.line(_uv, fill=_col, width=2)
    mo.vstack([mo.md("Red = SAM 2 mask, green = cup axis, blue = rim circle, yellow = base circle."), mo.image(_im)])
    return


@app.cell
def _(C, mo, np):
    import plotly.graph_objects as go

    _fig = go.Figure()
    for _p in sorted((C.HF_DIR / "processed").glob("v*.npz")) if (C.HF_DIR / "processed").exists() else []:
        if _p.stem.endswith("_mask"):
            continue
        _o = np.load(_p)["o"]
        _fig.add_trace(go.Scatter3d(x=_o[:, 0], y=_o[:, 1], z=_o[:, 2], mode="lines+markers", marker=dict(size=2), name=_p.stem))
    _fig.add_trace(go.Scatter3d(x=[0, 0], y=[0, 0], z=[0, 1], mode="lines", line=dict(width=8, color="black"), name="cup axis"))
    _fig.update_layout(scene=dict(aspectmode="data"), height=600, title="Camera paths in the cup frame (units = cup heights)")
    mo.ui.plotly(_fig)
    return


@app.cell
def _(C, mo):
    push = mo.ui.run_button(label="Push processed/ to the HF dataset (needs a write token in HF_TOKEN)")
    push
    return (push,)


@app.cell
def _(C, mo, push):
    mo.stop(not push.value)
    C.push_processed()
    mo.md("Pushed `processed/`.")
    return


if __name__ == "__main__":
    app.run()
