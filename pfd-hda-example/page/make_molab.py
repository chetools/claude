"""Generate the two notebook variants of the walkthrough from CELLS (single
source: python/walkthrough.py) and the model source (python/balance.py):

  notebook/walkthrough_molab.py  editable notebook for MoLab (self-contained file)
  notebook/walkthrough_wasm.py   same cells plus an in-notebook installer cell,
                                 exported read-only with `marimo export html-wasm`

The model source is inlined into one cell, byte-identity asserted; the
namespace `balance` that the cells use is derived from the module's syntax tree.
Run:  python make_molab.py
"""
import ast
import sys
import textwrap
from pathlib import Path

HERE = Path(__file__).parent
PYDIR = HERE / "python"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(PYDIR))

import make_molab_core as core  # noqa: E402  (copied unchanged from the skill)
from walkthrough import CELLS  # noqa: E402

# Module registration (one of the three places checked by build_page.py).
MODULE_REGISTRATION = {
    "balance": "inlined into the notebook (byte-identity asserted)",
    "walkthrough": "source of the notebook cells",
    "runner": "not needed: the notebook runs its own cells",
    "model_api": "not needed: page interface only",
}
MARIMO_VERSION = "0.25.2"
DEPENDENCIES = ["marimo", "numpy", "plotly"]

core.SETUP_NAMES = {"mo", "np", "go", "balance", "make_fig"}
core.SETUP_IMPORTS = {"import numpy as np", "import balance",
                      "import plotly.graph_objects as go"}


def namespace_members(source):
    """Top-level names of the module, from its syntax tree (functions and
    assignment targets; imports excluded): (public, private)."""
    names = []
    for node in ast.parse(source).body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names += [t.id for t in targets if isinstance(t, ast.Name)]
    return ([n for n in names if not n.startswith("_")],
            [n for n in names if n.startswith("_")])


def balance_cell(source):
    public, private = namespace_members(source)
    members = ", ".join(f"{n}={n}" for n in public + private)
    body = source.rstrip("\n") + "\n\nfrom types import SimpleNamespace as _NS\nbalance = _NS(" + members + ")"
    return core.cell(body, [], public + ["balance"]), public


def md_cell(text):
    assert '"""' not in text
    return ('@app.cell(hide_code=True)\ndef _(mo):\n    mo.md(r"""\n'
            + textwrap.indent(text, "    ") + '\n    """)\n    return\n\n\n')


def step_cells(i, cell, available):
    """marimo cells of walkthrough step i: markdown, then code (the first step
    is split into an inputs cell of plain constants and the rest)."""
    out = [md_cell(f'## Step {i}: {cell["title"]}\n\n{cell["md"]}')]
    code = core.strip_setup(cell["code"])
    pieces = []
    if i == 1:
        lines = code.splitlines()
        const = [l for l in lines if ast.parse(l).body and isinstance(ast.parse(l).body[0], ast.Assign)
                 and isinstance(ast.parse(l).body[0].value, ast.Constant)]
        pieces.append("\n".join(const))
        pieces.append("\n".join(l for l in lines if l not in const).strip("\n"))
    else:
        pieces.append(code)
    for piece in pieces:
        body, figs = core.convert_figures(piece)
        if "print(" in body:
            # show the printed intermediate as the cell's output (read-only runs hide stdout)
            body = ("with mo.capture_stdout() as _buf:\n" + textwrap.indent(body, "    ")
                    + "\n\nmo.vstack([mo.plain_text(_buf.getvalue())" + "".join(", " + f for f in figs) + "])")
        elif figs:
            body += "\n\nmo.vstack([" + ", ".join(figs) + "])"
        defs = core.defs_of(body)
        args = (core.loads_of(body) & available) - defs
        out.append(core.cell(body, args, defs))
        available |= defs
    return out


def build(variant):
    src = (PYDIR / "balance.py").read_text(encoding="utf-8")
    core.check_unique([dict(code=c["code"]) for c in CELLS])
    bal, public = balance_cell(src)
    clash = [n for c in CELLS for n in core.defs_of(core.strip_setup(c["code"]))
             if n in set(public) | {"balance"}]
    assert not clash, f"step code redefines model names: {clash}"
    head = ("# /// script\n# requires-python = \">=3.10\"\n# dependencies = ["
            + ", ".join(f'"{d}"' for d in DEPENDENCIES) + "]\n# ///\n"
            f'import marimo\n\n__generated_with = "{MARIMO_VERSION}"\napp = marimo.App(width="medium")\n\n\n')
    setup_body = "import marimo as mo\nimport numpy as np\nimport plotly.graph_objects as go\n\n"
    setup_body += "def make_fig(traces, **layout):\n    return go.Figure(data=traces, layout=layout)"
    parts = [head]
    if variant == "wasm":
        parts.append('@app.cell(hide_code=True)\nasync def _():\n    import sys\n    if sys.platform == "emscripten":\n'
                     '        import micropip\n        _ = await micropip.install("plotly")\n    return\n\n\n')
    parts.append(core.cell(setup_body, [], ["go", "make_fig", "mo", "np"]))
    parts.append(md_cell("# Toluene hydrodealkylation plant: balance walkthrough\n\n"
                         "Seven steps of the page's Code panel. Edit the inputs of step 1 and run all cells "
                         "(the results shown on the page were computed when the page was built)."))
    parts.append(bal)
    available = set(public) | {"balance", "mo", "np", "go", "make_fig"}
    for i, cell in enumerate(CELLS, 1):
        parts += step_cells(i, cell, available)
    parts.append('if __name__ == "__main__":\n    app.run()\n')
    text = "".join(parts)
    # byte-identity of the inlined model source
    assert textwrap.indent(src.rstrip("\n"), "    ") in text, "inlined balance source differs from balance.py"
    ast.parse(text)
    return text


def main():
    out = HERE / "notebook"
    out.mkdir(exist_ok=True)
    for variant in ("molab", "wasm"):
        (out / f"walkthrough_{variant}.py").write_text(build(variant), encoding="utf-8")
        print("written", out / f"walkthrough_{variant}.py")


if __name__ == "__main__":
    main()
