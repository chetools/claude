"""Closure tests of the page model against the design basis of the sheets
(run: python -m pytest page/python)."""
import itertools, json, pathlib, sys

import pytest

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import balance as B  # noqa: E402

ATOMS = {"H2": (0, 2), "CH4": (1, 4), "B": (6, 6), "T": (7, 8), "D": (12, 10)}
SHEET_DATA = HERE.parent.parent / "streams.json"


def test_design_basis_reproduces_sheet_exactly():
    S, _ = B.solve_iter(exact=True)
    for n, comp in B.DESIGN_ANCHOR.items():
        for c, v in comp.items():
            assert round(S[n][c], 1) == v, (n, c)
    d = json.loads(SHEET_DATA.read_text())["streams"]
    for n in B.STREAMS:
        for c in B.C:
            assert round(S[n][c], 1) == d[str(n)]["flows"][c], (n, c)


def test_float_solution_within_display_rounding_of_sheet():
    Sf, _ = B.solve()
    St, _ = B.solve_iter(exact=True)
    assert max(abs(Sf[n][c] - St[n][c]) for n in B.STREAMS for c in B.C) < 1.0


GRID = list(itertools.product([10, 100, 500], [0.30, 0.5, 0.75, 0.95], [0.05, 0.25, 0.60], [2, 5, 10]))


@pytest.mark.parametrize("F,X,beta,r", GRID)
def test_whole_range_two_methods_and_atom_balance(F, X, beta, r):
    S, _ = B.solve(F, X, beta, r)
    Si, _ = B.solve_iter(F, X, beta, r, max_iter=200000)
    assert max(abs(S[n][c] - Si[n][c]) for n in B.STREAMS for c in B.C) < 1e-8 * F
    assert min(S[n][c] for n in B.STREAMS for c in B.C) > -1e-9
    for i in (0, 1):
        fin = sum(S[n][c] * ATOMS[c][i] for n in (1, 5) for c in B.C)
        fout = sum(S[n][c] * ATOMS[c][i] for n in (19, 24, 28, 40) for c in B.C)
        assert abs(fin - fout) < 1e-9 * F
    e = B.evaluate(F, X, beta, r)
    assert abs(e["reactor_toluene"] * r - S[9]["H2"]) < 1e-8 * F


@pytest.mark.parametrize("bad", [dict(F=0), dict(F=501), dict(X=0.2), dict(X=1.0), dict(beta=0.7),
                                 dict(r=1), dict(F="abc"), dict(r=float("nan")), dict(X=None, beta=[1])])
def test_invalid_inputs_give_plain_language_errors(bad):
    with pytest.raises(ValueError) as e:
        B.evaluate(**bad)
    assert "must" in str(e.value)
