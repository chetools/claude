"""Helpers shared by the reference solutions."""
import math

G = 9.81  # m/s^2


def colebrook_f(Re, rel_rough):
    """Darcy friction factor from the Colebrook equation, by fixed-point iteration on 1/sqrt(f)."""
    if Re < 2300:
        return 64.0 / Re
    x = -2.0 * math.log10(rel_rough / 3.7 + 5.74 / Re**0.9)   # Swamee-Jain start
    for _ in range(100):
        x_new = -2.0 * math.log10(rel_rough / 3.7 + 2.51 * x / Re)
        if abs(x_new - x) < 1e-14:
            break
        x = x_new
    return 1.0 / x_new**2


def bisect(fun, lo, hi, tol=1e-12):
    """Plain bisection: fun(lo) and fun(hi) must have opposite signs."""
    f_lo = fun(lo)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        f_mid = fun(mid)
        if (f_mid > 0) == (f_lo > 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
        if hi - lo < tol * max(1.0, abs(mid)):
            break
    return 0.5 * (lo + hi)
