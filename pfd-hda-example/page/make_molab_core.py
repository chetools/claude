import ast, re, textwrap

SETUP_NAMES = {"mo", "np", "go", "<module>", "make_fig"}       # defined once, in the setup cell
SETUP_IMPORTS = {"import numpy as np", "import <module>"}      # stripped from step code

def strip_setup(code):
    return "\n".join(l for l in code.strip("\n").splitlines() if l.strip() not in SETUP_IMPORTS).strip("\n")

class _Defs(ast.NodeVisitor):
    """Global names a cell defines (marimo semantics): top-level assignments, loop targets,
    imports, def/class names -- not names inside functions/lambdas/comprehensions, not _private."""
    def __init__(self): self.names = set()
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store) and not node.id.startswith("_"): self.names.add(node.id)
    def visit_Import(self, node):
        for a in node.names:
            n = (a.asname or a.name).split(".")[0]
            if not n.startswith("_"): self.names.add(n)
    visit_ImportFrom = visit_Import
    def visit_FunctionDef(self, node):
        if not node.name.startswith("_"): self.names.add(node.name)
    visit_ClassDef = visit_FunctionDef
    def _skip(self, node): pass
    visit_Lambda = visit_ListComp = visit_SetComp = visit_DictComp = visit_GeneratorExp = _skip

def defs_of(code):  v = _Defs(); v.visit(ast.parse(code)); return v.names
def loads_of(code): return {n.id for n in ast.walk(ast.parse(code)) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}

def check_unique(cells):            # raise if two cells define the same global
    seen = {}
    for i, c in enumerate(cells):
        for n in defs_of(strip_setup(c["code"])):
            if n in seen or n in SETUP_NAMES | {"USER_INPUTS"}:
                raise ValueError(f"name {n!r} defined in step {seen.get(n, 0) + 1} and step {i + 1}")
            seen[n] = i

def convert_figures(code):          # top-level figure(...) -> _figN = make_fig(...)
    names = []
    def sub(m): names.append(f"_fig{len(names) + 1}"); return f"{names[-1]} = make_fig("
    return re.sub(r"(?m)^figure\(", sub, code), names

def cell(body, args, returns):      # one @app.cell with explicit args and returns
    sig = ", ".join(sorted(args))
    ret = "return" if not returns else "return (" + ", ".join(sorted(returns)) + ",)"
    return f"@app.cell\ndef _({sig}):\n{textwrap.indent(body, '    ')}\n    {ret}\n\n\n"
