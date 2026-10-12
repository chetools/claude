# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "marimo", "numpy", "scipy", "pillow", "plotly", "huggingface_hub>=1.5,<2", "imageio-ffmpeg",
#   "torch", "torchvision", "transformers", "timm", "scikit-learn",
#   "einops", "safetensors", "opencv-python", "hydra-core", "iopath", "tqdm",
# ]
# ///
import marimo

__generated_with = "0.14.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import dataclasses
    import os

    import marimo as mo
    import numpy as np
    import torch
    from PIL import Image

    import wl_common as C
    import wl_model as M

    mo.md(
        "# WaterLevel pipeline: data → poses → audits → training\n"
        "Each stage has its own button and pulls/decodes whatever it needs, so they can be run in any order "
        "(poses must exist before audits and training; they are cached on HF, so normally they already do). "
        "Results go to the HF dataset; open `04_eval.py` to look at them."
    )
    return C, Image, M, dataclasses, mo, np, os, torch


@app.cell
def _(mo, os):
    token_ui = mo.ui.text(
        label="HF token (needed only for pushes or a private dataset; otherwise taken from HF_TOKEN)",
        kind="password", value=os.environ.get("HF_TOKEN", ""), full_width=True,
    )
    token_ui
    return (token_ui,)


@app.cell
def _(C, mo, token_ui):
    tok = token_ui.value or None
    try:
        labels = C.ensure_labels(tok)
        _msg = mo.md(f"Dataset `{C.DATASET_REPO}`: " + ", ".join(f"`{_s}` {_g:g} g" for _s, _g in labels))
    except Exception as e:  # no network / no token for a private dataset
        labels = []
        _msg = mo.callout(mo.md(f"Could not fetch `labels.csv`: `{type(e).__name__}: {e}`. Enter a token above if the dataset is private."), kind="danger")
    stems = [_s for _s, _ in labels]
    _msg
    return labels, stems, tok


@app.cell
def _(C, M, stems, tok, torch):
    _store = {}

    def get_sampler():
        """One GPU Sampler shared by the audit and training stages; rebuilt whenever the poses change."""
        C.pull_dataset(tok)
        for _s in stems:
            C.decode_video(_s)
            _npz, _pt = C.HF_DIR / "processed" / f"{_s}.npz", C.WORK / "cache" / f"{_s}.pt"
            if _pt.exists() and _npz.exists() and _npz.stat().st_mtime > _pt.stat().st_mtime:
                _pt.unlink()  # crop cache older than its poses
        _key = tuple(sorted((p.name, p.stat().st_mtime_ns) for p in (C.HF_DIR / "processed").glob("*.npz")))
        if _store.get("key") != _key:
            _store.clear()
            torch.cuda.empty_cache()
            _store["S"], _store["key"] = M.Sampler(stems, patch=16), _key
        return _store["S"]

    return (get_sampler,)


# --------------------------------------------------------------------------- 0 · data


@app.cell
def _(mo):
    data_go = mo.ui.run_button(label="Pull dataset and decode")
    mo.vstack([
        mo.md("---\n## 0 · Data\nPull the dataset, decode every video to frames, check rotation and HDR, show contact sheets."),
        data_go,
    ])
    return (data_go,)


@app.cell
def _(C, data_go, labels, mo, tok):
    mo.stop(not data_go.value, mo.md("Press the button (later stages also do this on their own)."))
    with C.run_log("data", tok) as _notes:
        C.pull_dataset(tok)
        infos = {_s: C.decode_video(_s)[1] for _s, _ in labels}
        _notes += [f"- {_s}: {_i['codec_line'][:90]} rot={_i['rotation']} hdr={_i['hdr']} tonemapped={_i['tonemapped']}" for _s, _i in infos.items()]
    _rows = []
    for _stem, _g in labels:
        _i = infos[_stem]
        _rows.append({
            "video": _stem, "grams": _g, "frames": len(C.frame_files(_stem)), "rotation": _i["rotation"],
            "HDR": _i["hdr"], "tone-mapped": _i["tonemapped"], "stream": _i["codec_line"][:90],
        })
    _bad = [r["video"] for r in _rows if r["HDR"] and not r["tone-mapped"]]
    _warn = mo.callout(mo.md(f"**HDR video without tone-mapping** ({', '.join(_bad)}): ffmpeg has no `zscale`. "
                             "Colours will differ per video, which is a leak. Install a full ffmpeg and set `WL_FFMPEG`."),
                       kind="danger") if _bad else mo.md("HDR check passed: every HDR video was tone-mapped to SDR.")
    mo.vstack([mo.ui.table(_rows, selection=None), _warn])
    return (infos,)


@app.cell
def _(C, Image, infos, labels, mo):
    _sheets = []
    for _stem, _g in labels:
        _files = C.frame_files(_stem)
        _pick = [_files[round(_f * (len(_files) - 1))] for _f in (0, 0.25, 0.5, 0.75, 1)]
        _thumbs = []
        for _f in _pick:
            _im = Image.open(_f)
            _im.thumbnail((260, 260))
            _thumbs.append(mo.image(_im))
        _sheets.append(mo.vstack([mo.md(f"**{_stem}** · {_g:g} g · {infos[_stem]['rotation']}° rotation"), mo.hstack(_thumbs, justify="start")]))
    mo.accordion({"Contact sheets": mo.vstack(_sheets)})
    return


# --------------------------------------------------------------------------- 1 · poses


@app.cell
def _(mo, stems):
    pose_pick = mo.ui.multiselect(stems, value=stems, label="Videos")
    pose_prompt = mo.ui.text(value="a transparent drinking glass", label="Detector prompt", full_width=True)
    pose_box = mo.ui.text(label="Box override on frame 0 (x0,y0,x1,y1 in the 518-px image; blank = auto)", full_width=True)
    pose_redo = mo.ui.checkbox(label="Recompute videos that already have poses")
    pose_go = mo.ui.run_button(label="Run VGGT + masks + cup frame")
    mo.vstack([
        mo.md(
            "---\n## 1 · Poses and the cup frame\n"
            "VGGT gives per-frame K and extrinsics in an arbitrary frame; OWLv2 + SAM 2 give the cup mask; "
            "then everything is expressed in the cup's own frame (z = table normal, origin = base centre, 1 unit = cup height). "
            "Videos whose poses are already on HF are loaded, not recomputed, unless you tick Recompute."
        ),
        pose_pick, pose_prompt, pose_box, pose_redo, pose_go,
    ])
    return pose_box, pose_go, pose_pick, pose_prompt, pose_redo


@app.cell
def _(C, Image, np, torch):
    VW = 518

    def load_small(files):
        """Resize to VGGT resolution (width 518, height a multiple of 14). Returns (S,3,H,W) float and the per-axis scale."""
        im0 = Image.open(files[0])
        Wf, Hf = im0.size
        H = max(14, round(VW * Hf / Wf / 14) * 14)
        arr = np.stack([np.asarray(Image.open(f).convert("RGB").resize((VW, H), Image.BILINEAR)) for f in files])
        return torch.from_numpy(arr).permute(0, 3, 1, 2).float() / 255, (VW / Wf, H / Hf), (Wf, Hf)

    def run_vggt(imgs):
        C.ensure_vggt()
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
        res = proc.post_process_grounded_object_detection(out, threshold=0.05, target_sizes=torch.tensor([[side, side]]))[0]
        if len(res["scores"]) == 0:
            raise RuntimeError("detector found nothing; give a box override")
        b = res["boxes"][res["scores"].argmax()].cpu().numpy()
        del det
        torch.cuda.empty_cache()
        return b

    def run_sam2(imgs, box, stem):
        C.ensure_sam2()
        from sam2.sam2_video_predictor import SAM2VideoPredictor

        d = C.WORK / "sam" / stem
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

    return detect_box, load_small, run_sam2, run_vggt


@app.cell
def _(C, detect_box, load_small, mo, np, pose_box, pose_go, pose_pick, pose_prompt, pose_redo, run_sam2, run_vggt, tok):
    mo.stop(not pose_go.value, mo.md("Press the button to process."))
    C.pull_dataset(tok)
    _cup = C.read_cup()
    _out = C.HF_DIR / "processed"
    _out.mkdir(parents=True, exist_ok=True)

    def _process(stem):
        from scipy.ndimage import median_filter, uniform_filter1d

        C.decode_video(stem)
        files = C.frame_files(stem)
        imgs, (sx, sy), (Wf, Hf) = load_small(files)
        ext, intr, pts, conf = run_vggt(imgs)
        box = detect_box(imgs[0], pose_prompt.value, pose_box.value)
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
        metres = _cup.get("inner_height_mm", None)
        np.savez_compressed(_out / f"{stem}.npz", K=K_full.astype(np.float32), K_low=intr.astype(np.float32),
                            Rc=Rc.astype(np.float32), o=o.astype(np.float32), box=bx.astype(np.float32),
                            frame_ids=np.arange(len(masks)), wh_full=np.array([Wf, Hf]), wh_low=np.array(masks.shape[2:][::-1]),
                            height_world=fr["s"], radius_units=fr["radius"] / fr["s"],
                            metres_per_unit=(metres / 1000.0) if metres else np.nan)
        np.savez_compressed(_out / f"{stem}_mask.npz", mask=masks)
        d = fr["diag"]
        return {"frames": len(masks), "plane inliers": round(d["plane_inlier_frac"], 3),
                "height spread": round(d["height_spread"], 3), "centre spread": round(d["centre_spread"], 3),
                "radius (units)": round(d["radius_units"], 3),
                "base offset median": round(float(np.nanmedian(offs)), 3), "base offset p90": round(float(np.nanpercentile(np.abs(offs), 90)), 3)}

    pose_summary = []
    with C.run_log("poses", tok) as _notes:
        for _stem in pose_pick.value:
            if (_out / f"{_stem}.npz").exists() and (_out / f"{_stem}_mask.npz").exists() and not pose_redo.value:
                pose_summary.append({"video": _stem, "status": "cached"})
            else:
                _notes.append(f"- {_stem}: processing")
                pose_summary.append({"video": _stem, "status": "computed", **_process(_stem)})
            _notes.append(f"- {pose_summary[-1]}")
    _cols = list(dict.fromkeys(k for r in pose_summary for k in r))
    mo.vstack([
        mo.md("Done. Offsets are fractions of mask height (0 is perfect). Cached videos show no diagnostics; tick Recompute to redo them."),
        mo.ui.table([{k: r.get(k, "") for k in _cols} for r in pose_summary], selection=None),
    ])
    return (pose_summary,)


@app.cell
def _(C, mo, pose_summary):
    _have = sorted(p.stem for p in (C.HF_DIR / "processed").glob("*.npz") if not p.stem.endswith("_mask"))
    mo.stop(not (pose_summary and _have))
    pose_vid = mo.ui.dropdown(_have, value=_have[0], label="Video")
    pose_vid
    return (pose_vid,)


@app.cell
def _(C, mo, np, pose_vid):
    pz = np.load(C.HF_DIR / "processed" / f"{pose_vid.value}.npz")
    mk = np.load(C.HF_DIR / "processed" / f"{pose_vid.value}_mask.npz")["mask"]
    pose_frame = mo.ui.slider(0, len(mk) - 1, value=0, label="Frame", full_width=True)
    pose_frame
    return mk, pose_frame, pz


@app.cell
def _(C, Image, mk, mo, np, pose_frame, pose_vid, pz):
    from PIL import ImageDraw
    from scipy.ndimage import binary_erosion

    _i = pose_frame.value
    _f = Image.open(C.frame_files(pose_vid.value)[_i]).convert("RGB").resize((int(pz["wh_low"][0]), int(pz["wh_low"][1])))
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
def _(C, mo, np, pose_summary):
    import plotly.graph_objects as _go

    mo.stop(not pose_summary)
    _fig = _go.Figure()
    for _p in sorted((C.HF_DIR / "processed").glob("*.npz")):
        if _p.stem.endswith("_mask"):
            continue
        _o = np.load(_p)["o"]
        _fig.add_trace(_go.Scatter3d(x=_o[:, 0], y=_o[:, 1], z=_o[:, 2], mode="lines+markers", marker=dict(size=2), name=_p.stem))
    _fig.add_trace(_go.Scatter3d(x=[0, 0], y=[0, 0], z=[0, 1], mode="lines", line=dict(width=8, color="black"), name="cup axis"))
    _fig.update_layout(scene=dict(aspectmode="data"), height=600, title="Camera paths in the cup frame (units = cup heights)")
    mo.ui.plotly(_fig)
    return


@app.cell
def _(mo):
    pose_push = mo.ui.run_button(label="Push processed/ to the HF dataset (needs a write token)")
    pose_push
    return (pose_push,)


@app.cell
def _(C, mo, pose_push, tok):
    mo.stop(not pose_push.value)
    C.push_processed(tok)
    mo.md("Pushed `processed/`.")
    return


# --------------------------------------------------------------------------- 2 · audits


@app.cell
def _(mo):
    audit_go = mo.ui.run_button(label="Run baselines and audits")
    mo.vstack([
        mo.md(
            "---\n## 2 · Baselines and leak audits\n"
            "All numbers are leave-one-video-out (LOVO) in grams. Each audit should land **near the train-mean predictor**; "
            "if it does much better, that signal is a shortcut the real model could also use."
        ),
        audit_go,
    ])
    return (audit_go,)


@app.cell
def _(np, stems, torch):
    import timm
    import torch.nn.functional as F

    def feats_dino(S):
        m = timm.create_model("vit_small_patch14_dinov2.lvd142m", pretrained=True, num_classes=0, img_size=224).cuda().eval()
        X, g = [], []
        for vi in range(len(stems)):
            idx = S.frames_of(vi)
            for i in range(0, len(idx), 128):
                img, _ = S.eval_views(idx[i : i + 128])
                with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
                    t = m.forward_features(img)
                X.append(torch.cat([t[:, 0], t[:, m.num_prefix_tokens :].mean(1)], 1).float().cpu())
            g += [vi] * len(idx)
        return torch.cat(X).numpy(), np.array(g)

    def feats_background(S):
        """DINOv2 features of the frame with the (dilated) cup painted grey: only the scene is visible."""
        m = timm.create_model("vit_small_patch14_dinov2.lvd142m", pretrained=True, num_classes=0, img_size=224).cuda().eval()
        X = []
        for vi in range(len(stems)):
            idx = S.frames_of(vi)
            for i in range(0, len(idx), 128):
                j = idx[i : i + 128]
                im = S.img[j].float() / 255
                keep = F.max_pool2d(S.mask[j].float(), 31, 1, 15)
                im = im * (1 - keep) + 0.5 * keep
                im = F.interpolate(im, size=224, mode="bilinear", align_corners=False)
                im = (im - S.mean) / S.std
                with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
                    t = m.forward_features(im)
                X.append(torch.cat([t[:, 0], t[:, m.num_prefix_tokens :].mean(1)], 1).float().cpu())
        return torch.cat(X).numpy()

    def feats_colour(S, bins=32):
        X = []
        for vi in range(len(stems)):
            idx = S.frames_of(vi)
            for k in idx.tolist():
                px = S.img[k][:, S.mask[k, 0] > 0].float().cpu().numpy()  # (3, n) cup pixels
                if px.shape[1] == 0:
                    px = S.img[k].reshape(3, -1).float().cpu().numpy()
                h = np.concatenate([np.histogram(px[c], bins=bins, range=(0, 255))[0] for c in range(3)]).astype(float)
                X.append(h / h.sum())
        return np.array(X)

    def feats_rays(S):
        X = []
        for vi in range(len(stems)):
            idx = S.frames_of(vi)
            for i in range(0, len(idx), 128):
                j = idx[i : i + 128]
                _, ry = S.eval_views(j)
                o = S.o[j]
                az_free = torch.stack([o[:, :2].norm(dim=1), o[:, 2], o.norm(dim=1)], 1)
                X.append(torch.cat([ry.mean(1), ry.std(1), az_free], 1).cpu())
        return torch.cat(X).numpy()

    return feats_background, feats_colour, feats_dino, feats_rays


@app.cell
def _(C, audit_go, feats_background, feats_colour, feats_dino, feats_rays, get_sampler, labels, mo, np, stems, tok):
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.model_selection import GridSearchCV, GroupKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    mo.stop(not audit_go.value, mo.md("Press the button to run the audits."))
    with C.run_log("audits", tok) as _notes:
        _S = get_sampler()
        _X_dino, _grp = feats_dino(_S)
        _feats = {"frozen DINOv2 + ridge": _X_dino, "background only (cup hidden)": feats_background(_S),
                  "colour histogram only": feats_colour(_S), "rays only": feats_rays(_S)}
        _gm = dict(labels)
        _y = np.array([_gm[stems[g]] for g in _grp], dtype=float)

        def _lovo_ridge(X):
            out = {}
            for h in range(len(stems)):
                tr, te = _grp != h, _grp == h
                gs = GridSearchCV(make_pipeline(StandardScaler(), Ridge()), {"ridge__alpha": [1, 10, 100, 1e3, 1e4]},
                                  cv=GroupKFold(n_splits=min(4, len(set(_grp[tr])))), scoring="neg_mean_absolute_error")
                gs.fit(X[tr], _y[tr], groups=_grp[tr])
                out[stems[h]] = dict(true=_gm[stems[h]], frames=gs.predict(X[te]).tolist())
            return out

        ridge_res = {_k: {"variant": _k, "folds": _lovo_ridge(_v)} for _k, _v in _feats.items()}

        # video id from rays alone: contiguous time blocks held out inside every video (chance = 1/n_videos)
        _Xr = StandardScaler().fit_transform(_feats["rays only"])
        _pos = np.concatenate([np.linspace(0, 1, (_grp == g).sum(), endpoint=False) for g in range(len(stems))])
        _block = np.minimum((_pos * 5).astype(int), 4)
        _acc = []
        for _b in range(5):
            _clf = LogisticRegression(max_iter=2000).fit(_Xr[_block != _b], _grp[_block != _b])
            _acc.append(float((_clf.predict(_Xr[_block == _b]) == _grp[_block == _b]).mean()))
        id_acc = float(np.mean(_acc))
        _notes.append(f"- video id from rays: {id_acc:.3f}")
    return id_acc, ridge_res


@app.cell
def _(C, id_acc, labels, mo, ridge_res, stems, tok):
    _base = C.summarize(C.mean_predictor(labels), labels)
    _rows = [{"audit / baseline": "train mean (floor)", "mid MAE (g)": round(_base["mid_mae"], 1), "end MAE (g)": round(_base["end_mae"], 1)}]
    for _k, _r in ridge_res.items():
        _s = C.summarize(_r, labels)
        _rows.append({"audit / baseline": _k, "mid MAE (g)": round(_s["mid_mae"], 1), "end MAE (g)": round(_s["end_mae"], 1)})
        C.save_results(_r, "audit_" + _k.split(" ")[0].lower() if _k != "frozen DINOv2 + ridge" else "baseline_dino_ridge")
    C.save_results(C.mean_predictor(labels), "baseline_mean")
    C.push_results(tok)
    _verdict = mo.md(
        f"**Video ID from rays alone:** {id_acc:.0%} accuracy on held-out time blocks (chance {1 / len(stems):.0%}). "
        + ("Camera paths fingerprint the videos: apply the fallbacks in the plan (drop absolute ray moments, or rebalance frames by viewpoint)."
           if id_acc > 0.5 else "Rays are not an easy fingerprint.")
    )
    mo.vstack([mo.ui.table(_rows, selection=None), _verdict,
               mo.md("Audits (background, colour, rays) that beat the train-mean row clearly mean a shortcut exists. "
                     "The frozen DINOv2 row is the generic-feature baseline, not an audit.")])
    return


# --------------------------------------------------------------------------- 3 · training


@app.cell
def _(M, mo):
    train_variants = mo.ui.multiselect(list(M.VARIANTS), value=["rays"], label="Variants")
    train_folds = mo.ui.text(value="all", label="Hold-out videos (comma separated stems, or 'all')")
    train_s1 = mo.ui.number(100, 20000, step=100, value=M.Cfg.stage1_steps, label="Stage 1 steps")
    train_s2 = mo.ui.number(100, 20000, step=100, value=M.Cfg.stage2_steps, label="Stage 2 steps")
    train_push = mo.ui.checkbox(label="Push checkpoints to the HF model repo (needs a write token)")
    train_go = mo.ui.run_button(label="Train")
    mo.vstack([
        mo.md(
            "---\n## 3 · LeJEPA pretraining + fine-tuning, leave-one-video-out\n"
            "Per fold: stage 1 (multi-view LeJEPA on the training videos) then stage 2 (Huber on z-scored grams + small SIGReg). "
            "Results go to `work/results/<variant>.json` and are pushed after every fold; fold checkpoints can go to the HF model repo because molab sessions end."
        ),
        train_variants, train_folds, mo.hstack([train_s1, train_s2]), train_push, train_go,
    ])
    return train_folds, train_go, train_push, train_s1, train_s2, train_variants


@app.cell
def _(C, M, dataclasses, get_sampler, labels, mo, stems, tok, train_folds, train_go, train_push, train_s1, train_s2, train_variants):
    mo.stop(not train_go.value, mo.md("Choose variants and press Train."))
    _S = get_sampler()
    _holds = stems if train_folds.value.strip() == "all" else [x.strip() for x in train_folds.value.split(",")]
    _ckpt = C.WORK / "ckpt"

    def _log(msg):
        print(msg, flush=True)

    _summaries = {}
    with C.run_log("training", tok) as _notes:
        for _v in train_variants.value:
            _cfg = dataclasses.replace(M.Cfg(variant=_v, stage1_steps=int(train_s1.value), stage2_steps=int(train_s2.value)), **M.VARIANTS[_v])
            _res = {"variant": _v, "cfg": _cfg.__dict__, "folds": {}}
            for _h in _holds:
                _notes.append(f"- {_v} fold {_h}: start")
                _res["folds"][_h] = M.run_fold(_S, labels, _h, _cfg, _ckpt, _log)
                C.save_results(_res, _v)  # saved after every fold so a dead session loses little
                C.push_results(tok)
            _summaries[_v] = C.summarize(_res, labels)
            _notes.append(f"- {_v}: {_summaries[_v]}")

        if train_push.value:
            from huggingface_hub import HfApi

            _api = HfApi(token=tok or C.hf_token())
            _api.create_repo(C.MODEL_REPO, private=True, exist_ok=True)
            _api.upload_folder(repo_id=C.MODEL_REPO, folder_path=str(_ckpt), path_in_repo="ckpt")
    mo.vstack([
        mo.md("Done. Open `04_eval.py` for the full results."),
        mo.ui.table([{"variant": k, "all MAE": round(v["all_mae"], 1), "mid MAE": v["mid_mae"] and round(v["mid_mae"], 1),
                      "end MAE": v["end_mae"] and round(v["end_mae"], 1)} for k, v in _summaries.items()], selection=None),
    ])
    return


if __name__ == "__main__":
    app.run()
