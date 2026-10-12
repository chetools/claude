# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo", "numpy", "pillow", "huggingface_hub", "imageio-ffmpeg"]
# ///
import marimo

__generated_with = "0.14.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import os

    import marimo as mo

    import wl_common as C

    token_ui = mo.ui.text(label="HF token (read)", kind="password", value=os.environ.get("HF_TOKEN", ""))
    mo.md(f"# 00 · data\nDataset repo: `{C.DATASET_REPO}`. The token is only held in memory (or taken from `HF_TOKEN`).")
    return C, mo, token_ui


@app.cell
def _(mo, token_ui):
    go = mo.ui.run_button(label="Pull dataset and decode")
    mo.vstack([token_ui, go])
    return (go,)


@app.cell
def _(C, go, mo, token_ui):
    mo.stop(not go.value, mo.md("Press the button."))
    C.pull_dataset(token_ui.value or None)
    labels = C.read_labels()
    infos = {}
    for _s, _g in labels:
        _, infos[_s] = C.decode_video(_s)
    mo.md("Decoded " + ", ".join(f"`{_n}`" for _n, _ in labels))
    return infos, labels


@app.cell
def _(C, infos, labels, mo):
    rows = []
    for _stem, _g in labels:
        _i = infos[_stem]
        rows.append({
            "video": _stem, "grams": _g, "frames": len(C.frame_files(_stem)), "rotation": _i["rotation"],
            "HDR": _i["hdr"], "tone-mapped": _i["tonemapped"], "stream": _i["codec_line"][:90],
        })
    bad = [r["video"] for r in rows if r["HDR"] and not r["tone-mapped"]]
    warn = mo.callout(mo.md(f"**HDR video without tone-mapping** ({', '.join(bad)}): ffmpeg has no `zscale`. "
                            "Colours will differ per video, which is a leak. Install a full ffmpeg and set `WL_FFMPEG`."),
                      kind="danger") if bad else mo.md("HDR check passed: every HDR video was tone-mapped to SDR.")
    mo.vstack([mo.ui.table(rows), warn])
    return


@app.cell
def _(C, labels, mo):
    from PIL import Image

    sheets = []
    for _stem, _g in labels:
        _files = C.frame_files(_stem)
        _pick = [_files[round(_f * (len(_files) - 1))] for _f in (0, 0.25, 0.5, 0.75, 1)]
        _thumbs = []
        for _f in _pick:
            _im = Image.open(_f)
            _im.thumbnail((260, 260))
            _thumbs.append(mo.image(_im))
        sheets.append(mo.vstack([mo.md(f"**{_stem}** · {_g:g} g"), mo.hstack(_thumbs, justify="start")]))
    mo.vstack(sheets)
    return


if __name__ == "__main__":
    app.run()
