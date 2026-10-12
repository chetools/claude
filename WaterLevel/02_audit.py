# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo", "numpy", "scikit-learn", "pillow", "timm", "torch", "torchvision", "huggingface_hub", "imageio-ffmpeg"]
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
        "# 02 · baselines and leak audits\n"
        "All numbers are leave-one-video-out (LOVO) in grams. Each audit should land **near the train-mean predictor**; "
        "if it does much better, that signal is a shortcut the real model could also use."
    )
    return C, mo


@app.cell
def _(mo):
    run = mo.ui.run_button(label="Run baselines and audits")
    run
    return (run,)


@app.cell
def _(C, mo, run):
    import numpy as np
    import torch

    import wl_model as M

    mo.stop(not run.value)
    C.pull_dataset()
    labels = C.read_labels()
    stems = [s for s, _ in labels]
    S = M.Sampler(stems, patch=16)
    return M, S, labels, np, stems, torch


@app.cell
def _(M, S, np, stems, torch):
    import timm
    import torch.nn.functional as F

    def feats_dino():
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

    def feats_background():
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

    def feats_colour(bins=32):
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

    def feats_rays():
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
def _(feats_background, feats_colour, feats_dino, feats_rays, labels, np, stems):
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.model_selection import GridSearchCV, GroupKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    X_dino, grp = feats_dino()
    feats = {"frozen DINOv2 + ridge": X_dino, "background only (cup hidden)": feats_background(),
             "colour histogram only": feats_colour(), "rays only": feats_rays()}
    gm = dict(labels)
    y = np.array([gm[stems[g]] for g in grp], dtype=float)

    def lovo_ridge(X):
        out = {}
        for h in range(len(stems)):
            tr, te = grp != h, grp == h
            gs = GridSearchCV(make_pipeline(StandardScaler(), Ridge()), {"ridge__alpha": [1, 10, 100, 1e3, 1e4]},
                              cv=GroupKFold(n_splits=min(4, len(set(grp[tr])))), scoring="neg_mean_absolute_error")
            gs.fit(X[tr], y[tr], groups=grp[tr])
            out[stems[h]] = dict(true=gm[stems[h]], frames=gs.predict(X[te]).tolist())
        return out

    ridge_res = {k: {"variant": k, "folds": lovo_ridge(v)} for k, v in feats.items()}

    # video id from rays alone: contiguous time blocks held out inside every video (chance = 1/n_videos)
    Xr = StandardScaler().fit_transform(feats["rays only"])
    pos = np.concatenate([np.linspace(0, 1, (grp == g).sum(), endpoint=False) for g in range(len(stems))])
    block = np.minimum((pos * 5).astype(int), 4)
    acc = []
    for b in range(5):
        clf = LogisticRegression(max_iter=2000).fit(Xr[block != b], grp[block != b])
        acc.append(float((clf.predict(Xr[block == b]) == grp[block == b]).mean()))
    id_acc = float(np.mean(acc))
    return id_acc, ridge_res


@app.cell
def _(C, id_acc, labels, mo, ridge_res, stems):
    base = C.summarize(C.mean_predictor(labels), labels)
    rows = [{"audit / baseline": "train mean (floor)", "mid MAE (g)": round(base["mid_mae"], 1), "end MAE (g)": round(base["end_mae"], 1)}]
    for k, r in ridge_res.items():
        s = C.summarize(r, labels)
        rows.append({"audit / baseline": k, "mid MAE (g)": round(s["mid_mae"], 1), "end MAE (g)": round(s["end_mae"], 1)})
        C.save_results(r, "audit_" + k.split(" ")[0].lower() if k != "frozen DINOv2 + ridge" else "baseline_dino_ridge")
    C.save_results(C.mean_predictor(labels), "baseline_mean")
    verdict = mo.md(
        f"**Video ID from rays alone:** {id_acc:.0%} accuracy on held-out time blocks (chance {1 / len(stems):.0%}). "
        + ("Camera paths fingerprint the videos: apply the fallbacks in the plan (drop absolute ray moments, or rebalance frames by viewpoint)."
           if id_acc > 0.5 else "Rays are not an easy fingerprint.")
    )
    mo.vstack([mo.ui.table(rows), verdict,
               mo.md("Audits (background, colour, rays) that beat the train-mean row clearly mean a shortcut exists. "
                     "The frozen DINOv2 row is the generic-feature baseline, not an audit.")])
    return


if __name__ == "__main__":
    app.run()
