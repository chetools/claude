# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo", "numpy", "pillow", "timm", "torch", "torchvision", "huggingface_hub", "imageio-ffmpeg"]
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
    import wl_model as M

    mo.md(
        "# 03 · LeJEPA pretraining + fine-tuning, leave-one-video-out\n"
        "Per fold: stage 1 (multi-view LeJEPA on the 5 training videos) then stage 2 (Huber on z-scored grams + small SIGReg). "
        "Results go to `work/results/<variant>.json`; fold checkpoints go to the HF model repo because molab sessions end."
    )
    return C, M, mo


@app.cell
def _(C, M, mo):
    variants = mo.ui.multiselect(list(M.VARIANTS), value=["rays"], label="Variants")
    folds = mo.ui.text(value="all", label="Hold-out videos (comma separated stems, or 'all')")
    s1 = mo.ui.number(100, 20000, step=100, value=M.Cfg.stage1_steps, label="Stage 1 steps")
    s2 = mo.ui.number(100, 20000, step=100, value=M.Cfg.stage2_steps, label="Stage 2 steps")
    push = mo.ui.checkbox(label="Push checkpoints to the HF model repo (needs a write token in HF_TOKEN)")
    go = mo.ui.run_button(label="Train")
    mo.vstack([variants, folds, mo.hstack([s1, s2]), push, go])
    return folds, go, push, s1, s2, variants


@app.cell
def _(C, M, folds, go, mo, push, s1, s2, variants):
    import dataclasses

    mo.stop(not go.value, mo.md("Choose variants and press Train."))
    C.pull_dataset()
    labels = C.read_labels()
    stems = [s for s, _ in labels]
    for _s in stems:
        C.decode_video(_s)
    S = M.Sampler(stems, patch=16)
    holds = stems if folds.value.strip() == "all" else [x.strip() for x in folds.value.split(",")]
    ckpt = C.WORK / "ckpt"
    log_lines = []

    def log(msg):
        log_lines.append(msg)
        print(msg, flush=True)

    summaries = {}
    for _v in variants.value:
        cfg = dataclasses.replace(M.Cfg(variant=_v, stage1_steps=int(s1.value), stage2_steps=int(s2.value)), **M.VARIANTS[_v])
        res = {"variant": _v, "cfg": cfg.__dict__, "folds": {}}
        for _h in holds:
            res["folds"][_h] = M.run_fold(S, labels, _h, cfg, ckpt, log)
            C.save_results(res, _v)  # saved after every fold so a dead session loses little
            C.push_results()
        summaries[_v] = C.summarize(res, labels)

    if push.value:
        from huggingface_hub import HfApi

        api = HfApi(token=C.hf_token())
        api.create_repo(C.MODEL_REPO, private=True, exist_ok=True)
        api.upload_folder(repo_id=C.MODEL_REPO, folder_path=str(ckpt), path_in_repo="ckpt")
    mo.vstack([
        mo.md("Done."),
        mo.ui.table([{"variant": k, "all MAE": round(v["all_mae"], 1), "mid MAE": v["mid_mae"] and round(v["mid_mae"], 1),
                      "end MAE": v["end_mae"] and round(v["end_mae"], 1)} for k, v in summaries.items()]),
    ])
    return


if __name__ == "__main__":
    app.run()
