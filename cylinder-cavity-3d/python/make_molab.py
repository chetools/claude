"""Generate the editable MoLab (marimo) notebook from the page's step-by-step breakdown.

    python make_molab.py [OUT.py]          (default: ../notebook/walkthrough_molab.py)

The notebook has the same steps, explanations and code as the Python tab of the page
(walkthrough.CELLS); the page and the notebook therefore cannot drift apart.  MoLab opens a single file
from GitHub with no repository checkout, so lbm3d.py, fv3d.py and diagnostics.py are embedded (as source
text, executed into module objects) in the setup cell.  The cell body is indented by the generator, so the
embedded text is dedented again (textwrap.dedent) before it is executed.

marimo requires that each global name is defined in exactly one cell; check_unique() enforces that on
walkthrough.CELLS, and a check refuses a figure(...) call that is not at the top level of a cell
(only top-level calls can be rewritten).  build.py calls main().
"""
import ast
import os
import re
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import walkthrough  # noqa: E402

PAGE_URL = "https://chetools.github.io/claude/cylinder-cavity-3d/"
GENERATED_WITH = "0.25.2"                     # marimo version the file layout follows (marimo check is clean)
MODULES = ("diagnostics", "lbm3d", "fv3d")    # embedded modules, in the order they are executed
SETUP_NAMES = {"mo", "np", "go", "lbm3d", "fv3d", "diagnostics", "make_fig"}
SETUP_IMPORTS = {"import numpy as np", "import lbm3d", "import fv3d", "import diagnostics"}

# Inputs cell: the defaults of the first walkthrough cell
INPUTS = dict(N=32, Nz=8, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=0.5, span="periodic", seed=1e-3,
              method="fv", T_end=3.0)
INPUT_DOCS = {
    "N": "cells per box side (a power of two, at least 8)",
    "Nz": "cells along the span for the 3D run of the last section (a power of two; 1 = the 2D baseline)",
    "Re": "Reynolds number U_ref 2R / nu",
    "R": "cylinder radius (box width = 1)",
    "ro": "distance of the cylinder centre from the box centre (orbit radius)",
    "Us": "spin surface speed Omega R (+ = counter-clockwise, 0 = no spin)",
    "Uo": "orbit speed of the centre (+ = counter-clockwise, 0 = fixed position)",
    "span": '"periodic" (infinite cylinder) or "walls" (no-slip end walls, Nz >= 2)',
    "seed": "amplitude of the deliberate 3D perturbation, in units of U_ref (0 = none)",
    "method": '"fv" (finite volumes) or "lbm" (lattice Boltzmann, several times more steps) for the last section',
    "T_end": "duration of the 2D-versus-3D experiment, in time units L / U_ref",
}


class _Defs(ast.NodeVisitor):
    """Global names a cell defines (marimo semantics): top-level assignments, loop targets, imports,
    def/class names -- not names inside functions, lambdas or comprehensions, and not _private names."""

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


def strip_setup(code):
    return "\n".join(l for l in code.strip("\n").splitlines() if l.strip() not in SETUP_IMPORTS).strip("\n")


def check_unique(cells):
    """Raise if two cells define the same global (marimo would refuse), or if a figure(...) call is
    not at the top level of its cell."""
    seen = {}
    for i, c in enumerate(cells):
        code = strip_setup(c["code"])
        for n in defs_of(code):
            if n in seen or n in SETUP_NAMES | {"USER_INPUTS"}:
                raise ValueError(f"name {n!r} is defined in step {seen.get(n, 0) + 1} and step {i + 1}; "
                                 "marimo needs one definition per name")
            seen[n] = i
        calls = [n for n in ast.walk(ast.parse(code))
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "figure"]
        top = len(re.findall(r"(?m)^figure\(", code))
        if len(calls) != top:
            raise ValueError(f"step {i + 1} ({c['title']}): figure(...) must be called at the top level "
                             f"of the cell, at the start of a line ({len(calls)} calls, {top} at top level)")
        for bad in ('"""', "'''"):
            if bad in code or bad in c["md"]:
                raise ValueError(f"step {i + 1}: triple quotes are not allowed in cells ({bad})")


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


def module_source(name):
    src = open(os.path.join(HERE, name + ".py"), encoding="utf-8").read()
    assert "'''" not in src, f"{name}.py contains triple single quotes; it cannot be embedded as a raw string"
    assert not src.rstrip().endswith("\\"), f"{name}.py ends with a backslash"
    return src


def setup_cell():
    lines = ["# Setup: libraries, the three project modules (embedded source of python/lbm3d.py, fv3d.py and",
             "# diagnostics.py, executed into module objects), and make_fig() to turn the plain trace dicts",
             "# used below into Plotly figures.",
             "import sys as _sys",
             "import textwrap as _textwrap",
             "import types as _types",
             "",
             "import marimo as mo",
             "import numpy as np",
             "import plotly.graph_objects as go",
             ""]
    for name in MODULES:
        lines.append(f"_{name.upper()}_SOURCE = r'''\n{module_source(name)}'''")
        lines.append("")
    for name in MODULES:
        lines.append(f'{name} = _types.ModuleType("{name}")')
        lines.append(f'_sys.modules["{name}"] = {name}   # so "import {name}" also works in your own cells')
        lines.append(f'exec(compile(_textwrap.dedent(_{name.upper()}_SOURCE), "{name}.py", "exec"), {name}.__dict__)')
    lines += ["", "",
              "def make_fig(traces, **layout):",
              '    """Plotly figure from trace dicts and layout keywords."""',
              '    layout.setdefault("height", 380)',
              "    return go.Figure(dict(data=traces, layout=layout))"]
    return "\n".join(lines)


def generate():
    cells = walkthrough.CELLS
    check_unique(cells)

    out = ['# /// script\n# requires-python = ">=3.10"\n'
           '# dependencies = ["marimo", "numpy", "plotly"]\n# ///\n\n'
           '"""A spinning, orbiting cylinder in a box, in 2D and 3D: the Python reference, step by step.\n\n'
           "Editable companion to " + PAGE_URL + "\n"
           "GENERATED by cylinder-cavity-3d/python/make_molab.py from walkthrough.py, lbm3d.py, fv3d.py and\n"
           "diagnostics.py; edit those files, not this one.  Self-contained (the three modules are embedded)\n"
           'because MoLab opens a single file from GitHub with no repository checkout.\n"""\n\n'
           f'import marimo\n\n__generated_with = "{GENERATED_WITH}"\napp = marimo.App(width="medium")\n\n\n']

    out.append(md_cell(f"""
# A spinning, orbiting cylinder in a box: 2D versus 3D, step by step

Editable companion to the [interactive page]({PAGE_URL}). Each step explains one piece of the two solvers
(a D3Q19 lattice Boltzmann solver and a finite-volume solver on a staggered grid) or one diagnostic, runs the
real module code, and shows the result. The same code is shown, with the same explanations, in the page's
*Python (step by step)* tab; the page's JavaScript and WebGPU solvers follow the same algorithms.

**To run:** once the notebook has loaded, run all cells once (command palette, "Re-run all cells", or the run
button). **To experiment:** edit a value in the `USER_INPUTS` cell below and re-run; every cell that depends on
it recomputes. The defaults are a small grid (N = 32, Nz = 8) so each step takes seconds; the page's live runs
use bigger grids. The last section (2D versus 3D) is the slowest cell; reduce `T_end` to shorten it.

The modules `lbm3d`, `fv3d` and `diagnostics` are embedded in the next cell. Syntax-highlighted listings are
in the page's source tabs.
"""))

    out.append(cell(setup_cell(), [], sorted(SETUP_NAMES)))

    lines = ["# Inputs. Edit a value and re-run: every downstream cell recomputes.",
             "USER_INPUTS = dict("]
    for k, val in INPUTS.items():
        lines.append(f"    {k}={val!r},  # {INPUT_DOCS[k]}")
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


def main(dst=None):
    dst = dst or (sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "notebook", "walkthrough_molab.py"))
    dst = os.path.abspath(dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(generate())
    print("wrote", dst)
    return dst


if __name__ == "__main__":
    main()
