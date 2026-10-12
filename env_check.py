# /// script
# # Dependencies = the WaterLevel notebooks', so molab builds the same environment they get.
# # For another project, swap in that project's dependencies and edit "Expected packages" in Settings.
# requires-python = ">=3.11"
# dependencies = [
#   "marimo", "packaging", "numpy", "scipy", "pillow", "plotly", "huggingface_hub>=1.5,<2", "imageio-ffmpeg",
#   "torch", "torchvision", "transformers",
#   "einops", "safetensors", "opencv-python", "hydra-core", "iopath", "tqdm",
#   "scikit-learn", "timm",
# ]
# ///
import marimo

__generated_with = "0.14.0"
app = marimo.App(width="full")


@app.cell
def _():
    import importlib.metadata as md
    import importlib.util
    import os
    import re
    import sys
    from pathlib import Path

    import marimo as mo
    from packaging.requirements import Requirement
    from packaging.specifiers import SpecifierSet

    mo.md(
        """
        # Environment check
        Which packages molab actually loads — the notebook's uv venv (**VENV**) or the image's
        preinstalled `/usr/local` (**BASE**) — compared with the expected packages (Settings; default: WaterLevel).
        Press **Send report to Claude** at the end so Claude can read it, or download it.
        """
    )
    return Path, Requirement, SpecifierSet, importlib, md, mo, os, re, sys


@app.cell
def _(mo, os):
    # Defaults: the WaterLevel notebooks (union of their headers) + their runtime git installs (vggt, sam-2).
    expected_ui = mo.ui.text_area(
        value="\n".join([
            "marimo", "numpy", "scipy", "pillow", "plotly", "huggingface-hub>=1.5,<2", "imageio-ffmpeg",
            "torch", "torchvision", "transformers", "einops", "safetensors", "opencv-python", "hydra-core",
            "iopath", "tqdm", "scikit-learn", "timm", "vggt", "sam-2",
        ]),
        label="Expected packages (one per line, optional version specifier)", rows=8, full_width=True,
    )
    dataset_ui = mo.ui.text(value=os.environ.get("WL_DATASET", "carlosco/waterlevel-videos"),
                            label="HF dataset that receives the report (under logs/)", full_width=True)
    mo.accordion({"Settings": mo.vstack([expected_ui, dataset_ui])})
    return dataset_ui, expected_ui


@app.cell
def _(Path, Requirement, expected_ui, re, sys):
    def norm(n):
        return re.sub(r"[-_.]+", "-", n).lower()

    EXPECTED = {}
    for _line in expected_ui.value.splitlines():
        if _line.strip() and not _line.strip().startswith("#"):
            _req = Requirement(_line.strip())
            EXPECTED[norm(_req.name)] = str(_req.specifier)
    IMPORT_NAME = {"pillow": "PIL", "huggingface-hub": "huggingface_hub", "opencv-python": "cv2",
                   "hydra-core": "hydra", "scikit-learn": "sklearn", "imageio-ffmpeg": "imageio_ffmpeg", "sam-2": "sam2"}

    def where(p):
        s = str(p)
        if "uv-venv" in s or (sys.prefix != sys.base_prefix and s.startswith(sys.prefix)):
            return "VENV"
        if s.startswith(sys.base_prefix) or s.startswith("/usr/"):
            return "BASE"
        return "/".join(Path(s).parts[-3:])
    return EXPECTED, IMPORT_NAME, norm, where


@app.cell
def _(all_rows, conflict_rows, env_info, expected_rows, mo, os, syspath_rows, tf_rows, tf_title, torch_info):
    # One markdown file with every table below, to download and hand to Claude.
    import datetime

    def _table(rows):
        if not rows:
            return "none\n"
        cols = list(rows[0])
        out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
        out += ["| " + " | ".join(str(r[c]).replace("|", "\\|") for c in cols) + " |" for r in rows]
        return "\n".join(out) + "\n"

    _stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    report_name = f"{_stamp}_env_report.md"
    report = "\n".join([
        f"# molab env report {_stamp}", "", env_info, "",
        f"## Dependency conflicts ({len(conflict_rows)})", _table(conflict_rows),
        "## Expected vs actual", _table(expected_rows),
        f"## {tf_title}", _table(tf_rows),
        "## torch", torch_info, "",
        "## sys.path order", _table(syspath_rows),
        f"## All installed ({len(all_rows)})", _table(all_rows),
    ])
    send_token = mo.ui.text(label="HF token (write)", kind="password", value=os.environ.get("HF_TOKEN", ""))
    send_go = mo.ui.run_button(label="Send report to Claude")
    mo.callout(
        mo.vstack([
            mo.md("**Report for Claude:** press *Send* (uploads it to `logs/` in the HF dataset, where Claude reads it), "
                  "or download it and drop the file into the chat."),
            mo.hstack([send_token, send_go,
                       mo.download(data=report.encode(), filename=report_name, mimetype="text/markdown", label="Download env report")],
                      justify="start", align="center"),
        ]),
        kind="info",
    )
    return report, report_name, send_go, send_token


@app.cell
def _(dataset_ui, mo, report, report_name, send_go, send_token):
    mo.stop(not send_go.value)
    from huggingface_hub import HfApi

    _repo = dataset_ui.value.strip()
    try:
        HfApi(token=send_token.value or None).upload_file(
            path_or_fileobj=report.encode(), path_in_repo=f"logs/{report_name}", repo_id=_repo, repo_type="dataset",
            commit_message="env_check report",
        )
        _out = mo.callout(mo.md(f"Sent `logs/{report_name}` to `{_repo}`. Tell Claude it is there."), kind="success")
    except Exception as e:
        _out = mo.callout(mo.md(f"Upload failed: `{type(e).__name__}: {e}`. Use the download button instead."), kind="danger")
    _out
    return


@app.cell
def _(Path, md, mo, norm, sys, where):
    # All installed dists, grouped by name; the first one on sys.path is what `import` gets.
    _order = {p: i for i, p in enumerate(sys.path)}
    found = {}
    for _d in md.distributions():
        _loc = str(Path(_d.locate_file("")).resolve())
        _rank = min((_order[p] for p in _order if p and str(Path(p).resolve()) == _loc), default=999)
        found.setdefault(norm(_d.metadata["Name"]), []).append((_rank, _d.version, _loc, _d))
    for _v in found.values():
        _v.sort(key=lambda t: t[0])
    active = {n: v[0][3] for n, v in found.items()}

    _n_venv = sum(where(v[0][2]) == "VENV" for v in found.values())
    _n_base = sum(where(v[0][2]) == "BASE" for v in found.values())
    env_info = (
        f"python `{sys.version.split()[0]}` · exe `{sys.executable}`  \n"
        f"prefix `{sys.prefix}` · base_prefix `{sys.base_prefix}`  \n"
        f"{len(found)} distributions: {_n_venv} active from VENV, {_n_base} from BASE"
    )
    syspath_rows = [{"#": i, "from": where(p) if p else "cwd", "path": p} for i, p in enumerate(sys.path)]
    mo.vstack([
        mo.md(env_info),
        mo.accordion({"sys.path order": mo.ui.table(syspath_rows, selection=None, page_size=30)}),
    ])
    return active, env_info, found, syspath_rows


@app.cell
def _(EXPECTED, IMPORT_NAME, SpecifierSet, found, importlib, mo, where):
    expected_rows = []
    for _name, _spec in EXPECTED.items():
        _entries = found.get(_name, [])
        if not _entries:
            expected_rows.append({"ok": "XX", "package": _name, "want": _spec or "*", "active": "MISSING",
                                  "from": "-", "imported from": "", "shadowed copies": ""})
            continue
        _, _ver, _loc, _ = _entries[0]
        _ok = _ver in SpecifierSet(_spec, prereleases=True) if _spec else True
        _s = importlib.util.find_spec(IMPORT_NAME.get(_name, _name.replace("-", "_")))
        expected_rows.append({
            "ok": "ok" if _ok else "XX", "package": _name, "want": _spec or "*", "active": _ver,
            "from": where(_loc), "imported from": _s.origin if _s else "NOT IMPORTABLE",
            "shadowed copies": "; ".join(f"{v}@{where(l)}" for _, v, l, _ in _entries[1:]),
        })
    mo.vstack([mo.md("## Expected vs actual"), mo.ui.table(expected_rows, selection=None, page_size=30)])
    return (expected_rows,)


@app.cell
def _(EXPECTED, Requirement, SpecifierSet, active, found, mo, norm, where):
    # pip-check equivalent over the *active* dists: every declared requirement satisfied?
    conflict_rows = []
    for _name, _d in sorted(active.items()):
        for _r in _d.requires or []:
            try:
                _req = Requirement(_r)
            except Exception:
                continue
            if _req.marker and not _req.marker.evaluate({"extra": ""}):
                continue
            _dep = active.get(norm(_req.name))
            if _dep is None:
                if _name in EXPECTED or norm(_req.name) in EXPECTED:
                    conflict_rows.append({"package": f"{_name} {_d.version}", "from": where(found[_name][0][2]),
                                          "needs": str(_req), "found": "MISSING", "dep from": "-"})
            elif _req.specifier and _dep.version not in SpecifierSet(str(_req.specifier), prereleases=True):
                conflict_rows.append({"package": f"{_name} {_d.version}", "from": where(found[_name][0][2]),
                                      "needs": str(_req), "found": _dep.version,
                                      "dep from": where(found[norm(_req.name)][0][2])})
    mo.vstack([
        mo.md(f"## Dependency conflicts ({len(conflict_rows)})"),
        mo.ui.table(conflict_rows, selection=None, page_size=30) if conflict_rows else mo.md("none"),
    ])
    return (conflict_rows,)


@app.cell
def _(Path, Requirement, SpecifierSet, active, importlib, md, mo, norm, where):
    # transformers checks its own pin table at import time; check it without importing.
    _ts = importlib.util.find_spec("transformers")
    tf_rows, tf_title = [], "transformers not installed"
    if _ts and _ts.origin:
        _ns = {}
        exec((Path(_ts.origin).parent / "dependency_versions_table.py").read_text(), _ns)
        for _k in ("huggingface-hub", "tokenizers", "safetensors", "numpy", "tqdm", "accelerate"):
            if _k in _ns["deps"]:
                _r = Requirement(_ns["deps"][_k])
                _have = active.get(norm(_k))
                _ok = _have is None or _have.version in SpecifierSet(str(_r.specifier), prereleases=True)
                tf_rows.append({"ok": "ok" if _ok else "XX", "pin": _ns["deps"][_k],
                                "have": _have.version if _have else "-"})
        tf_title = f"transformers {md.version('transformers')} import-time pins ({where(_ts.origin)})"
    mo.vstack([mo.md(f"## {tf_title}"), mo.ui.table(tf_rows, selection=None) if tf_rows else mo.md("")])
    return tf_rows, tf_title


@app.cell
def _(mo):
    try:
        import torch

        _cuda = torch.cuda.is_available()
        torch_info = (
            f"`{torch.__version__}` · cuda build `{torch.version.cuda}` · cuda available {_cuda}"
            + (f" · gpu `{torch.cuda.get_device_name(0)}`" if _cuda else "")
        )
    except Exception as e:
        torch_info = f"import failed: `{e!r}`"
    mo.md(f"## torch\n{torch_info}")
    return (torch_info,)


@app.cell
def _(found, mo, where):
    all_rows = [{"package": n, "active": v[0][1], "from": where(v[0][2]),
                 "other copies": "; ".join(f"{ver}@{where(loc)}" for _, ver, loc, _ in v[1:])}
                for n, v in sorted(found.items())]
    mo.vstack([
        mo.md("## All installed (active copy first)"),
        mo.ui.table(all_rows, selection=None, page_size=50),
    ])
    return (all_rows,)


if __name__ == "__main__":
    app.run()
