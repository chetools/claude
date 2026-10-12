# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo", "numpy", "plotly", "pillow", "timm", "torch", "torchvision", "huggingface_hub", "imageio-ffmpeg"]
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
    import numpy as np

    import wl_common as C

    mo.md("# 04 · results, audits and saliency")
    return C, mo, np


@app.cell
def _(C, mo):
    try:
        C.pull_dataset(include_videos=False)
        labels = C.read_labels()
    except Exception as e:  # offline: use whatever labels file is present locally
        labels = C.read_labels() if (C.HF_DIR / "labels.csv").exists() else []
    results = C.load_results()
    mo.stop(not results, mo.md("No results yet. Run 02 and 03 first."))
    results.setdefault("baseline_mean", C.mean_predictor(labels))
    table = []
    for name, r in results.items():
        s = C.summarize(r, labels)
        table.append({"run": name, "folds": len(r["folds"]), "all MAE (g)": round(s["all_mae"], 1),
                      "mid MAE (g)": s["mid_mae"] and round(s["mid_mae"], 1), "end MAE (g)": s["end_mae"] and round(s["end_mae"], 1)})
    mean_mid = next(t["mid MAE (g)"] for t in table if t["run"] == "baseline_mean")
    mo.vstack([mo.ui.table(table, selection=None), mo.md(f"Success target: mid-fold MAE below **{mean_mid / 2:.1f} g** (half the train-mean predictor), "
                                                         "audits near the mean predictor, rays at least matching `no_rays`.")])
    return labels, results


@app.cell
def _(C, labels, mo, results):
    import plotly.graph_objects as go

    _fig = go.Figure()
    _lo, _hi = min(g for _, g in labels), max(g for _, g in labels)
    _fig.add_trace(go.Scatter(x=[_lo, _hi], y=[_lo, _hi], mode="lines", line=dict(dash="dash", color="gray"), name="ideal"))
    for _name, _r in results.items():
        if _name.startswith("audit_"):
            continue
        _s = C.summarize(_r, labels)
        _fig.add_trace(go.Scatter(x=[v["true"] for v in _s["per"].values()], y=[v["pred"] for v in _s["per"].values()],
                                  mode="markers+text", text=list(_s["per"]), textposition="top center", name=_name))
    _fig.update_layout(xaxis_title="true grams", yaxis_title="video-level prediction (median over frames)", height=500)
    mo.ui.plotly(_fig)
    return


@app.cell
def _(C, mo, results):
    runs = [k for k, r in results.items() if r.get("cfg")]
    variant = mo.ui.dropdown(runs, value=runs[0] if runs else None, label="Model run")
    fold = mo.ui.dropdown(list(results[runs[0]]["folds"]) if runs else [], label="Held-out video")
    go_sal = mo.ui.run_button(label="Saliency (downloads the checkpoint if needed)")
    mo.vstack([mo.hstack([variant, fold]), go_sal])
    return fold, go_sal, variant


@app.cell
def _(C, fold, go_sal, labels, mo, np, variant):
    import torch
    from PIL import Image

    import wl_model as M

    mo.stop(not go_sal.value or not fold.value)
    _p = C.WORK / "ckpt" / f"{variant.value}_{fold.value}.pt"
    if not _p.exists():
        from huggingface_hub import hf_hub_download

        _p = hf_hub_download(C.MODEL_REPO, f"ckpt/{variant.value}_{fold.value}.pt", repo_type="model", local_dir=C.WORK, token=C.hf_token())
    _ck = torch.load(_p, map_location="cuda")
    _cfg = _ck["cfg"]
    for _s, _ in labels:
        C.decode_video(_s)
    _S = M.Sampler([s for s, _ in labels], patch=16)
    _net = M.WaterNet(pretrained=False, use_rays=_cfg["use_rays"]).cuda()
    _net.load_state_dict({k.removeprefix("module."): v for k, v in _ck["state"].items() if k != "n_averaged"})
    _vi = [s for s, _ in labels].index(fold.value)
    _idx = _S.frames_of(_vi)
    _pick = _idx[torch.linspace(0, len(_idx) - 1, 4).long()]
    _sal = M.saliency(_net, _S, _pick).detach().cpu().numpy()
    _img, _ = _S.eval_views(_pick)
    _img = (_img * _S.std + _S.mean).clamp(0, 1).permute(0, 2, 3, 1).cpu().numpy()
    _tiles = []
    for _a, _b in zip(_img, _sal):
        _h = (_b / (np.percentile(_b, 99.5) + 1e-12)).clip(0, 1)[..., None]
        _over = 0.4 * _a + 0.6 * _h * np.array([1.0, 0.2, 0.2])
        _tiles.append(mo.image(Image.fromarray((np.concatenate([_a, _over], 1) * 255).astype(np.uint8))))
    mo.vstack([mo.md("Left: crop. Right: gradient saliency (red). It should hug the water line and meniscus."), *_tiles])
    return


if __name__ == "__main__":
    app.run()
