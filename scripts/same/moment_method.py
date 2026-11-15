"""The SAME moment method (Final Science Report, 15 Mar 2010, §3.A, Eqs. 1-13), standard library only.

Conventions (as in the report):
- f_N(D) = dN/dD, number per unit volume per unit diameter; M_i = integral of D^i f_N(D) dD (Eq. 2f).
- M0 = Nt (number concentration), M1 = "diameter concentration", M3 proportional to volume/mass concentration.
- D0.5 = M1/M0 (count/arithmetic mean diameter), D1.5 = (M3/M0)^(1/3) (diameter of average mass).
- Lognormal f_N (Eq. 3) with geometric mean Dg and geometric standard deviation sigma_g; Hatch-Choate (Eq. 6):
  D_p = Dg exp(p ln^2 sigma_g); hence Dg = sqrt(D0.5^3 / D1.5) (Eq. 7), sigma_g = exp(sqrt(ln(D1.5/D0.5))) (Eq. 8).
- Relative uncertainties for independent moments (Eqs. 12-13).

Diameters may be in any one unit (nm in this project) as long as all are in the same unit; M_i then carries
[number/volume]·[diameter]^i. Invalid inputs raise ValueError instead of returning a number: non-finite or non-positive
values, and D1.5 < D0.5 (impossible for any distribution, since (M3/M0)^(1/3) >= M1/M0 by Jensen's inequality).
D1.5 == D0.5 means a monodisperse aerosol (sigma_g = 1).
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Lognormal:
    nt: float          # total number concentration (M0), any number/volume unit
    dg: float          # geometric mean diameter (= count median diameter)
    sigma_g: float     # geometric standard deviation (dimensionless, >= 1)


def _positive(name: str, value: float) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
        raise ValueError(f'{name} deve ser um número finito e positivo (recebido {value!r})')
    return float(value)


def check(distribution: Lognormal) -> Lognormal:
    _positive('Nt', distribution.nt)
    _positive('Dg', distribution.dg)
    if not math.isfinite(distribution.sigma_g) or distribution.sigma_g < 1:
        raise ValueError(f'sigma_g deve ser >= 1 (recebido {distribution.sigma_g!r})')
    return distribution


def moment(distribution: Lognormal, k: float) -> float:
    """Analytical k-th moment of the lognormal: Nt Dg^k exp(k^2 ln^2 sigma_g / 2)."""
    check(distribution)
    s = math.log(distribution.sigma_g)
    return distribution.nt * distribution.dg ** k * math.exp(k * k * s * s / 2)


def hatch_choate(dg: float, sigma_g: float, p: float) -> float:
    """Eq. 6: D_p = Dg exp(p ln^2 sigma_g). p = 0.5 count mean, 1.5 diameter of average mass, 3 mass median."""
    _positive('Dg', dg)
    if sigma_g < 1:
        raise ValueError('sigma_g deve ser >= 1')
    return dg * math.exp(p * math.log(sigma_g) ** 2)


def diameters_from_moments(m0: float, m1: float, m3: float) -> tuple[float, float]:
    """(D0.5, D1.5) from the three moments."""
    m0, m1, m3 = _positive('M0', m0), _positive('M1', m1), _positive('M3', m3)
    return m1 / m0, (m3 / m0) ** (1 / 3)


def lognormal_from_diameters(d05: float, d15: float, nt: float | None = None) -> dict:
    """Eqs. 7-8. Returns Dg, sigma_g (and Nt when given); refuses D1.5 < D0.5."""
    d05, d15 = _positive('D0.5', d05), _positive('D1.5', d15)
    ratio = d15 / d05
    if ratio < 1 - 1e-12:
        raise ValueError(f'D1.5 < D0.5 ({d15} < {d05}): incompatível com qualquer distribuição de tamanhos')
    ratio = max(ratio, 1.0)
    result = {'D0.5': d05, 'D1.5': d15, 'Dg': math.sqrt(d05 ** 3 / d15), 'sigma_g': math.exp(math.sqrt(math.log(ratio)))}
    if nt is not None:
        result['Nt'] = _positive('Nt', nt)
    return result


def lognormal_from_moments(m0: float, m1: float, m3: float) -> dict:
    """Moment method: (M0, M1, M3) -> D0.5, D1.5, Dg (Eq. 9 equivalent), sigma_g (Eq. 10 equivalent), Nt = M0."""
    d05, d15 = diameters_from_moments(m0, m1, m3)
    return lognormal_from_diameters(d05, d15, nt=m0)


def dg_direct(m0: float, m1: float, m3: float) -> float:
    """Eq. 9 written out: Dg = M0^(-4/3) M1^(3/2) M3^(-1/6)."""
    m0, m1, m3 = _positive('M0', m0), _positive('M1', m1), _positive('M3', m3)
    return m1 ** 1.5 / (m0 ** (4 / 3) * m3 ** (1 / 6))


def relative_uncertainty(sigma_g: float, ur_m0: float, ur_m1: float, ur_m3: float) -> dict:
    """Eqs. 12-13 (independent moments): relative combined uncertainties of Dg and sigma_g."""
    for name, value in (('ur(M0)', ur_m0), ('ur(M1)', ur_m1), ('ur(M3)', ur_m3)):
        if not math.isfinite(value) or value < 0:
            raise ValueError(f'{name} deve ser finito e >= 0')
    if sigma_g <= 1:
        raise ValueError('a incerteza relativa de sigma_g diverge para sigma_g = 1 (Eq. 13)')
    ur_dg = math.sqrt(16 / 9 * ur_m0 ** 2 + 2.25 * ur_m1 ** 2 + 1 / 36 * ur_m3 ** 2)
    ln_s = math.log(sigma_g)
    ur_sg = math.sqrt((ur_m0 ** 2 + 2.25 * ur_m1 ** 2 + 0.25 * ur_m3 ** 2) / (9 * ln_s * ln_s))
    return {'ur_Dg': ur_dg, 'ur_sigma_g': ur_sg}


def relative_uncertainty_numeric(m0: float, m1: float, m3: float, ur: tuple[float, float, float], step: float = 1e-6) -> dict:
    """First-order propagation by finite differences (cross-check of Eqs. 12-13; same independence assumption)."""
    base = lognormal_from_moments(m0, m1, m3)
    out = {}
    for key in ('Dg', 'sigma_g'):
        total = 0.0
        for index, (value, u) in enumerate(zip((m0, m1, m3), ur)):
            args = [m0, m1, m3]
            args[index] = value * (1 + step)
            derivative = (lognormal_from_moments(*args)[key] - base[key]) / (value * step)
            total += (derivative * value / base[key] * u) ** 2
        out['ur_' + key] = math.sqrt(total)
    return out


def number_fraction_above(distribution: Lognormal, diameter: float) -> float:
    """Fraction of particles (by number) larger than `diameter`."""
    check(distribution)
    s = math.log(distribution.sigma_g)
    if s == 0:
        return 1.0 if distribution.dg > diameter else 0.0
    return 0.5 * math.erfc((math.log(_positive('D', diameter)) - math.log(distribution.dg)) / (s * math.sqrt(2)))


def mass_fraction_above(distribution: Lognormal, diameter: float) -> float:
    """Fraction of particle volume (mass at constant density) in particles larger than `diameter`.

    The third-moment distribution of a lognormal is lognormal with the same sigma_g and median Dg exp(3 ln^2 sigma_g).
    """
    check(distribution)
    mass_median = hatch_choate(distribution.dg, distribution.sigma_g, 3)
    return number_fraction_above(Lognormal(1.0, mass_median, distribution.sigma_g), diameter)


def density(distribution: Lognormal, diameter: float, k: int = 0) -> float:
    """f_k(D) = D^k f_N(D) (Eq. 3 times D^k), per unit diameter."""
    check(distribution)
    d = _positive('D', diameter)
    s = math.log(distribution.sigma_g)
    if s == 0:
        raise ValueError('densidade indefinida para distribuição monodispersa')
    f_n = distribution.nt / (math.sqrt(2 * math.pi) * d * s) * math.exp(-(math.log(d) - math.log(distribution.dg)) ** 2 / (2 * s * s))
    return d ** k * f_n


def numeric_moment(distribution: Lognormal, k: int, points: int = 4000, span: float = 8.0) -> float:
    """Trapezoidal integral of D^k f_N(D) over ln D (synthetic check of the analytical moments)."""
    check(distribution)
    s = math.log(distribution.sigma_g)
    lo, hi = math.log(distribution.dg) - span * s, math.log(distribution.dg) + span * s
    step = (hi - lo) / points
    total = 0.0
    for index in range(points + 1):
        d = math.exp(lo + index * step)
        weight = 0.5 if index in (0, points) else 1.0
        total += weight * density(distribution, d, k) * d  # dD = D d(lnD)
    return total * step
