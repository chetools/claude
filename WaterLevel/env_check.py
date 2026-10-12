# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "marimo", "packaging", "numpy", "scipy", "pillow", "plotly", "huggingface_hub>=1.5,<2", "imageio-ffmpeg",
#   "torch", "torchvision", "transformers",
#   "einops", "safetensors", "opencv-python-headless", "hydra-core", "iopath", "tqdm",
#   "scikit-learn", "timm",
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
app = marimo.App(width="full")


@app.cell
def _():
    import importlib.metadata as md
    import importlib.util
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
        preinstalled `/usr/local` (**BASE**) — compared with what the WaterLevel notebooks declare.
        Dependency header is the union of all notebooks, so this builds the same env they get.
        """
    )
    return Path, Requirement, SpecifierSet, importlib, md, mo, re, sys


@app.cell
def _(Path, re, sys):
    # What the WaterLevel notebooks declare (union of all headers) + runtime git installs.
    EXPECTED = {
        "marimo": "", "numpy": "", "scipy": "", "pillow": "", "plotly": "",
        "huggingface-hub": ">=1.5,<2", "imageio-ffmpeg": "",
        "torch": "", "torchvision": "", "transformers": "",
        "einops": "", "safetensors": "", "opencv-python-headless": "", "hydra-core": "",
        "iopath": "", "tqdm": "", "scikit-learn": "", "timm": "",
        "vggt": "", "sam2": "",  # git installs via wl_common.ensure_vggt / ensure_sam2
    }
    IMPORT_NAME = {"pillow": "PIL", "huggingface-hub": "huggingface_hub", "opencv-python-headless": "cv2",
                   "hydra-core": "hydra", "scikit-learn": "sklearn", "imageio-ffmpeg": "imageio_ffmpeg"}

    def norm(n):
        return re.sub(r"[-_.]+", "-", n).lower()

    def where(p):
        s = str(p)
        if "uv-venv" in s or (sys.prefix != sys.base_prefix and s.startswith(sys.prefix)):
            return "VENV"
        if s.startswith(sys.base_prefix) or s.startswith("/usr/"):
            return "BASE"
        return "/".join(Path(s).parts[-3:])
    return EXPECTED, IMPORT_NAME, norm, where


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
    mo.vstack([
        mo.md(
            f"**python** `{sys.version.split()[0]}` · exe `{sys.executable}`  \n"
            f"**prefix** `{sys.prefix}` · base_prefix `{sys.base_prefix}`  \n"
            f"**{len(found)}** distributions: **{_n_venv}** active from VENV, **{_n_base}** from BASE"
        ),
        mo.accordion({
            "sys.path order": mo.ui.table(
                [{"#": i, "from": where(p) if p else "cwd", "path": p} for i, p in enumerate(sys.path)],
                selection=None, page_size=30,
            )
        }),
    ])
    return active, found


@app.cell
def _(EXPECTED, IMPORT_NAME, SpecifierSet, found, importlib, mo, where):
    _rows = []
    for _name, _spec in EXPECTED.items():
        _entries = found.get(_name, [])
        if not _entries:
            _rows.append({"ok": "XX", "package": _name, "want": _spec or "*", "active": "MISSING",
                          "from": "-", "imported from": "", "shadowed copies": ""})
            continue
        _, _ver, _loc, _ = _entries[0]
        _ok = _ver in SpecifierSet(_spec, prereleases=True) if _spec else True
        _s = importlib.util.find_spec(IMPORT_NAME.get(_name, _name.replace("-", "_")))
        _rows.append({
            "ok": "ok" if _ok else "XX", "package": _name, "want": _spec or "*", "active": _ver,
            "from": where(_loc), "imported from": _s.origin if _s else "NOT IMPORTABLE",
            "shadowed copies": "; ".join(f"{v}@{where(l)}" for _, v, l, _ in _entries[1:]),
        })
    mo.vstack([mo.md("## Expected vs actual"), mo.ui.table(_rows, selection=None, page_size=30)])
    return


@app.cell
def _(EXPECTED, Requirement, SpecifierSet, active, found, mo, norm, where):
    # pip-check equivalent over the *active* dists: every declared requirement satisfied?
    _rows = []
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
                    _rows.append({"package": f"{_name} {_d.version}", "from": where(found[_name][0][2]),
                                  "needs": str(_req), "found": "MISSING", "dep from": "-"})
            elif _req.specifier and _dep.version not in SpecifierSet(str(_req.specifier), prereleases=True):
                _rows.append({"package": f"{_name} {_d.version}", "from": where(found[_name][0][2]),
                              "needs": str(_req), "found": _dep.version,
                              "dep from": where(found[norm(_req.name)][0][2])})
    mo.vstack([
        mo.md(f"## Dependency conflicts ({len(_rows)})"),
        mo.ui.table(_rows, selection=None, page_size=30) if _rows else mo.md("none"),
    ])
    return


@app.cell
def _(Path, Requirement, SpecifierSet, active, importlib, md, mo, norm, where):
    # transformers checks its own pin table at import time; check it without importing.
    _ts = importlib.util.find_spec("transformers")
    if _ts and _ts.origin:
        _ns = {}
        exec((Path(_ts.origin).parent / "dependency_versions_table.py").read_text(), _ns)
        _rows = []
        for _k in ("huggingface-hub", "tokenizers", "safetensors", "numpy", "tqdm", "accelerate"):
            if _k in _ns["deps"]:
                _r = Requirement(_ns["deps"][_k])
                _have = active.get(norm(_k))
                _ok = _have is None or _have.version in SpecifierSet(str(_r.specifier), prereleases=True)
                _rows.append({"ok": "ok" if _ok else "XX", "pin": _ns["deps"][_k],
                              "have": _have.version if _have else "-"})
        _out = mo.vstack([
            mo.md(f"## transformers {md.version('transformers')} import-time pins ({where(_ts.origin)})"),
            mo.ui.table(_rows, selection=None),
        ])
    else:
        _out = mo.md("## transformers not installed")
    _out
    return


@app.cell
def _(mo):
    try:
        import torch

        _cuda = torch.cuda.is_available()
        _out = mo.md(
            f"## torch\n`{torch.__version__}` · cuda build `{torch.version.cuda}` · cuda available **{_cuda}**"
            + (f" · gpu `{torch.cuda.get_device_name(0)}`" if _cuda else "")
        )
    except Exception as e:
        _out = mo.md(f"## torch\nimport failed: `{e!r}`")
    _out
    return


@app.cell
def _(found, mo, where):
    mo.vstack([
        mo.md("## All installed (active copy first)"),
        mo.ui.table(
            [{"package": n, "active": v[0][1], "from": where(v[0][2]),
              "other copies": "; ".join(f"{ver}@{where(loc)}" for _, ver, loc, _ in v[1:])}
             for n, v in sorted(found.items())],
            selection=None, page_size=50,
        ),
    ])
    return


if __name__ == "__main__":
    app.run()
