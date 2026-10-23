"""Generate the editable MoLab (marimo) notebook notebook/solutions_molab.py from python/solutions/*.py.

    python make_molab.py [OUT.py]

MoLab opens one file from GitHub with no repository checkout, so common.py is embedded in a cell and every
solution is copied from its own source file (the page's Code tab shows the same files; they cannot drift apart).
marimo needs each global defined in exactly one cell, so solve() becomes solve_pNN, INPUTS becomes pNN_inputs and
check_unique() verifies the result before the file is written.
"""
import ast
import os
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
SOL = os.path.join(HERE, "solutions")
PAGE_URL = "https://chetools.github.io/claude/ai-cheme-benchmark/"
N_PROBLEMS = 12


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def split_module(src):
    """(docstring, tree) of a solution module."""
    tree = ast.parse(src)
    return ast.get_docstring(tree, clean=False), tree


def seg(src, node):
    return ast.get_source_segment(src, node)


def cell(body, args, returns):
    sig = ", ".join(sorted(args))
    ret = "return" if not returns else "return (" + ", ".join(sorted(returns)) + ",)"
    return f"@app.cell\ndef _({sig}):\n{textwrap.indent(body.rstrip(), '    ')}\n    {ret}\n\n\n"


def md_cell(text):
    assert '"""' not in text
    return cell(f'mo.md(r"""\n{text.strip()}\n""")', ["mo"], [])


def loads(code):
    return {n.id for n in ast.walk(ast.parse(code)) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def common_cell():
    """The functions and constants of common.py in one cell (its docstring and `import math` dropped)."""
    src = read(os.path.join(SOL, "common.py"))
    doc, tree = split_module(src)
    keep, names = [], []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)) or (isinstance(node, ast.Expr) and
                                                              isinstance(node.value, ast.Constant)):
            continue
        keep.append(seg(src, node))
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.Assign):
            names += [t.id for t in node.targets if isinstance(t, ast.Name)]
    return "\n\n\n".join(keep), names


def problem_cells(n, common_names):
    """Four cells for problem n: explanation, inputs, solver + result, table."""
    pid = f"p{n:02d}"
    src = read(os.path.join(SOL, f"{pid}.py"))
    doc, tree = split_module(src)
    inputs_src, funcs, extra = None, [], []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "INPUTS" for t in node.targets):
            inputs_src = seg(src, node.value)
        elif isinstance(node, ast.FunctionDef):
            funcs.append(node)
        elif isinstance(node, (ast.Import, ast.ImportFrom)) or (isinstance(node, ast.Expr) and
                                                                isinstance(node.value, ast.Constant)):
            continue
        else:
            extra.append(node)
    if inputs_src is None or not any(f.name == "solve" for f in funcs) or extra:
        raise ValueError(f"{pid}.py: expected only imports, INPUTS, functions (incl. solve) after the docstring")
    helper_names = {f.name for f in funcs if f.name != "solve"}
    clash = (helper_names | {"solve"}) & set(common_names)
    if clash:
        raise ValueError(f"{pid}.py defines {clash}, which common.py also defines")

    out = [md_cell(doc)]
    out.append(cell(f"# Inputs for {pid.upper()}: plain constants. Edit a value and re-run.\n"
                    f"{pid}_inputs = {inputs_src}", [], [f"{pid}_inputs"]))
    parts = []
    for f in funcs:
        s = seg(src, f)
        if f.name == "solve":
            s = s.replace("def solve(", f"def solve_{pid}(", 1)
        parts.append(s)
    body = "\n\n\n".join(parts)
    used = loads("\n".join(parts))
    args = ({"math"} | set(common_names) | helper_names) & used
    args = {a for a in args if a not in helper_names}
    args |= {f"{pid}_inputs"}
    code = body + f"\n\n\n{pid}_result = solve_{pid}(**{pid}_inputs)"
    out.append(cell(code, args, helper_names | {f"solve_{pid}", f"{pid}_result"}))
    out.append(cell(f'mo.ui.table([{{"part": _k, "value": _v}} for _k, _v in {pid}_result.items()], '
                    f'selection=None, label="{pid.upper()} answers")', ["mo", f"{pid}_result"], []))
    return out


def check_unique(cells_defs):
    seen = {}
    for i, names in enumerate(cells_defs):
        for n in names:
            if n in seen:
                raise ValueError(f"global {n!r} defined in cells {seen[n]} and {i}")
            seen[n] = i


def generate():
    common_src, common_names = common_cell()
    out = ['# /// script\n# requires-python = ">=3.10"\n# dependencies = ["marimo", "numpy"]\n# ///\n\n'
           '"""Reference solutions of the 12 chemical-engineering problems of the AI benchmark page.\n\n'
           f"Editable companion to {PAGE_URL}\n"
           "GENERATED by ai-cheme-benchmark/python/make_molab.py from python/solutions/*.py; edit those files,\n"
           "not this one.  Self-contained (common.py is embedded) because MoLab opens a single file from GitHub.\n"
           '"""\n\nimport marimo\n\n__generated_with = "0.25.2"\napp = marimo.App(width="medium")\n\n\n']
    defs = []
    out.append(md_cell(f"""
# Reference solutions: AI models on ChemE problems

Editable companion to the [benchmark page]({PAGE_URL}). Each problem has an explanation, an **inputs**
cell of plain constants (edit and re-run), the solver, and a table of the answers.
**To run:** once the notebook has opened, run all cells once. **To experiment:** change a value in a
`pNN_inputs` cell and re-run; the answers below it recompute.
"""))
    out.append(cell("import math\n\nimport marimo as mo", [], ["math", "mo"]))
    defs += [["mo", "math"]]
    out.append(cell("# common.py: helpers shared by the solutions\n" + common_src, ["math"], common_names))
    defs.append(common_names)
    for n in range(1, N_PROBLEMS + 1):
        cs = problem_cells(n, common_names)
        out += cs
        pid = f"p{n:02d}"
        defs += [[], [f"{pid}_inputs"], None, []]
        # names defined by the solver cell
        tree = ast.parse(read(os.path.join(SOL, f"{pid}.py")))
        helpers = [f.name for f in tree.body if isinstance(f, ast.FunctionDef) and f.name != "solve"]
        defs[-2] = helpers + [f"solve_{pid}", f"{pid}_result"]
    check_unique(defs)
    out.append('if __name__ == "__main__":\n    app.run()\n')
    return "".join(out)


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "notebook", "solutions_molab.py")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(generate())
    print("wrote", dst)


if __name__ == "__main__":
    main()
