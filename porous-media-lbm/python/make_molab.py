"""Generate the editable MoLab (marimo) notebook from the page's breakdown.

    python make_molab.py OUT.py

The notebook has the same steps, explanations and code as the Python tab of
the page (walkthrough.CELLS); the page and the notebook therefore cannot
drift apart.  MoLab opens a single file from GitHub with no repository
checkout, so lbm.py is embedded in the setup cell.

marimo requires that each global name is defined in exactly one cell;
check_unique() enforces that on walkthrough.CELLS (build.py calls it).
"""
import ast
import os
import re
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import walkthrough  # noqa: E402

PAGE_URL = "https://chetools.github.io/claude/porous-media-lbm/"
SETUP_NAMES = {"mo", "np", "go", "lbm", "make_fig"}
SETUP_IMPORTS = {"import numpy as np", "import lbm"}

# Inputs of step 1 (same keys as the dict p there; the defaults are taken from that cell)
INPUT_DOCS = {
    "Lx_d": "domain length in particle diameters",
    "Ly_d": "domain height in particle diameters",
    "D": "resolution: lattice cells per particle diameter",
    "porosity": "target porosity of the bed",
    "gap_d": "minimum gap between particles, in diameters",
    "spread": "particle-size spread (+/- fraction of D)",
    "seed": "random seed (same bed as the page for the same seed and domain)",
    "layout": '"random", "square", "staggered" or "empty"',
    "walls": "solid walls at the top and bottom",
    "tau": "relaxation time; lattice viscosity nu = (tau - 1/2)/3",
    "Pe_m": "molecular Peclet number u d / D_m of the tracer",
    "u_tracer": "interstitial velocity used for the tracer run (lattice units)",
    "d_p_mm": "particle diameter for the SI conversion [mm]",
    "nu_SI": "kinematic viscosity for the SI conversion [m2/s]",
}


class _Defs(ast.NodeVisitor):
    """Global names a cell defines (marimo semantics): top-level assignments,
    loop targets, imports, def/class names -- not names inside functions,
    lambdas or comprehensions, and not _private names."""

    def __init__(self):
        self.names = set()

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store) and not node.id.startswith("_"):
            self.names.add(node.id)

    def visit_Import(self, node):
        for a in node.names:
            n = (a.asname or a.name).split(".")[0]
            if not n.startswith("_"):
                self.names.add(n)

    visit_ImportFrom = visit_Import

    def visit_FunctionDef(self, node):
        if not node.name.startswith("_"):
            self.names.add(node.name)

    visit_ClassDef = visit_FunctionDef

    def _skip(self, node):
        pass

    visit_Lambda = visit_ListComp = visit_SetComp = visit_DictComp = visit_GeneratorExp = _skip


def defs_of(code):
    v = _Defs()
    v.visit(ast.parse(code))
    return v.names


def loads_of(code):
    return {n.id for n in ast.walk(ast.parse(code)) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def check_unique(cells):
    """Raise if two cells define the same global (marimo would refuse)."""
    seen = {}
    for i, c in enumerate(cells):
        for n in defs_of(strip_setup(c["code"])):
            if n in seen or n in SETUP_NAMES | {"USER_INPUTS"}:
                raise ValueError(f"name {n!r} is defined in step {seen.get(n, 0) + 1} and step {i + 1}; "
                                 "marimo needs one definition per name")
            seen[n] = i


def strip_setup(code):
    return "\n".join(l for l in code.strip("\n").splitlines() if l.strip() not in SETUP_IMPORTS).strip("\n")


def convert_figures(code):
    """Top-level figure(...) calls -> _figN = make_fig(...); returns (code, names)."""
    names = []

    def sub(m):
        names.append(f"_fig{len(names) + 1}")
        return f"{names[-1]} = make_fig("

    return re.sub(r"(?m)^figure\(", sub, code), names


def cell(body, args, returns):
    sig = ", ".join(sorted(args))
    ret = "return" if not returns else "return (" + ", ".join(sorted(returns)) + ",)"
    return f"@app.cell\ndef _({sig}):\n{textwrap.indent(body, '    ')}\n    {ret}\n\n\n"


def md_cell(text):
    assert '"""' not in text
    return cell(f'mo.md(r"""\n{text.strip()}\n""")', ["mo"], [])


def default_inputs():
    """The dict p of step 1 with USER_INPUTS empty: the notebook's default inputs."""
    import contextlib
    import io
    ns = {"USER_INPUTS": {}}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(walkthrough.CELLS[0]["code"], "<step 1>", "exec"), ns)
    return ns["p"]


def generate():
    src = open(os.path.join(HERE, "lbm.py"), encoding="utf-8").read()
    assert "'''" not in src
    cells = walkthrough.CELLS
    check_unique(cells)

    out = ['# /// script\n# requires-python = ">=3.10"\n'
           '# dependencies = ["marimo", "numpy", "plotly"]\n# ///\n\n'
           '"""Lattice-Boltzmann flow, permeability and tracer RTD in a 2D packed bed, step by step.\n\n'
           "Editable companion to " + PAGE_URL + "\n"
           "GENERATED by porous-media-lbm/python/make_molab.py from walkthrough.py and lbm.py;\n"
           "edit those files, not this one.  Self-contained (lbm.py is embedded) because MoLab\n"
           'opens a single file from GitHub with no repository checkout.\n"""\n\n'
           "import marimo\n\n__generated_with = \"0.25.1\"\napp = marimo.App(width=\"medium\")\n\n\n"]

    out.append(md_cell(f"""
# Packed bed: lattice-Boltzmann flow, permeability and RTD, step by step

Editable companion to the [interactive page]({PAGE_URL}), where the same algorithm runs live on the GPU
(WebGPU). Each step explains one piece of the method, runs it in plain numpy on a coarse grid, and shows the
result. The same code is shown, with the same explanations, in the page's *Python (step by step)* tab.

**To run:** once the notebook has loaded, run all cells (command palette → "Re-run all cells", or the
run button). The whole notebook takes about half a minute. **To experiment:** edit a value in the
`USER_INPUTS` cell below and re-run; every cell that depends on it recomputes.

The reference module `lbm` (lattices, bed generation, streaming with bounce-back, TRT collision with
body force, D2Q5 tracer, RTD analysis, correlations) is embedded in the next cell. A syntax-highlighted
listing is in the page's *lbm.py (full source)* tab.
"""))

    setup = ("# Setup: libraries, the reference module lbm (embedded source of python/lbm.py),\n"
             "# and make_fig() to turn the plain trace dicts used below into Plotly figures.\n"
             "import sys as _sys\nimport types as _types\n\n"
             "import marimo as mo\nimport numpy as np\nimport plotly.graph_objects as go\n\n"
             f"_LBM_SOURCE = r'''{src}'''\n\n"
             'lbm = _types.ModuleType("lbm")\n'
             "exec(compile(_LBM_SOURCE, \"lbm.py\", \"exec\"), lbm.__dict__)\n"
             '_sys.modules["lbm"] = lbm   # so "import lbm" also works in your own cells\n\n\n'
             "def make_fig(traces, **layout):\n"
             '    """Plotly figure from trace dicts and layout keywords."""\n'
             "    layout.setdefault(\"height\", 380)\n"
             "    return go.Figure(dict(data=traces, layout=layout))")
    out.append(cell(setup, [], sorted(SETUP_NAMES)))

    q = default_inputs()
    assert set(q) == set(INPUT_DOCS), set(q) ^ set(INPUT_DOCS)
    lines = ["# Inputs (the page's defaults). Edit a value and re-run: every downstream cell recomputes.",
             "USER_INPUTS = dict("]
    for k in q:
        lines.append(f"    {k}={q[k]!r},  # {INPUT_DOCS[k]}")
    lines.append(")")
    out.append(cell("\n".join(lines), [], ["USER_INPUTS"]))

    defined = set(SETUP_NAMES) | {"USER_INPUTS"}
    for i, c in enumerate(cells):
        out.append(md_cell(f"## Step {i + 1}: {c['title']}\n\n{c['md'].strip()}"))
        code = strip_setup(c["code"])
        code, figs = convert_figures(code)
        d = defs_of(code)
        args = (loads_of(code) & defined) - d
        if figs:
            args |= {"make_fig"}
            code += "\n" + (figs[0] if len(figs) == 1 else f"mo.vstack([{', '.join(figs)}])")
            if len(figs) > 1:
                args |= {"mo"}
        out.append(cell(code, args, d))
        defined |= d

    out.append('if __name__ == "__main__":\n    app.run()\n')
    return "".join(out)


if __name__ == "__main__":
    dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "notebook", "walkthrough_molab.py")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(generate())
    print("wrote", dst)
