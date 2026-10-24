# Traced Symbol Library — Verification Summary

Library version 1. Verification date: 2026-10-24. Governing requirement:
PFD-SPEC-001 requirement S3 — a reproduced symbol shall preserve the
outline, internal linework, proportions, and port positions of the
original symbol, with deviation of any port position or principal outline
dimension not exceeding 0.5 mm at final scale.

## Method

The reproductions were verified against geometry decoded directly from
the original symbol definition files, rather than against rendered
images. For every symbol, the decoded frame, port anchor coordinates, and
principal outline points were compared numerically with the reproduction
in `pfd_symbols.py` and `symbols.json`. Circular outlines are drawn as
four-segment bezier approximations; the maximum radial deviation of that
approximation is 0.302 local units, equal to 0.06 mm at final scale,
within the S3 limit.

## Results

Pass (10): `feed_1`, `product_1`, `pump_1`, `compressor_1`,
`heat_exchanger_1`, `flash_1`, `scds_1`, `kinetic_1`, `valve_1`,
`control_valve_1`. All decodable ports and frames are numerically
identical to the source geometry.

Conditional (2):

- `expander_1` — traced by symmetry with `compressor_1` (same polygon
  form, reversed taper; the compressor trapezoid corners were decoded
  verbatim: left edge 230 units, right edge 115 units, width 192 units,
  common centreline). The stored instance of the expander is rotated
  90 degrees; the library supplies the horizontal flowsheet form. Port
  extraction for this entry was partial in the stored orientation.
- `vessel_1` — structural trace. The end-cap piece was decoded (30 by 11
  local units, cap depth 0.37 of diameter) and 12 port instances were
  counted; body proportions follow the decoded cap ratio, and absolute
  body length is a library convention (3 diameters overall).

## Recorded geometry notes

- `pump_1`: discharge is a tangent stub at the top of the circle to port
  (534, 173), with arrowhead; suction at (441, 230).
- `flash_1`: 8 ports — six on the left side, one at the top centre, one
  at the right at liquid level.
- `scds_1`: body rectangle (530, 200)–(590, 520); top cap arc chord at
  y = 235, apex at y = 220; 20 port instances in the source file.
- `kinetic_1`: bottom port (634, 767); the seven-point head arc was
  decoded.
- Two source records remain uninterpreted (segments in `kinetic_1` and
  `flash_1`) and are not drawn.

Stroke widths are set per symbol for 0.5 mm at final scale, using the
`scale_mm_per_unit` factor recorded for each entry in `symbols.json`.
