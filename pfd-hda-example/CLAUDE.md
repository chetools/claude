# pfd-hda-example: project notes

Two-sheet PFD (PFD-201 reaction, PFD-202 separation) of a toluene HDA plant, drawn with the
process-flow-diagram-drawing skill (vendored read-only in `skill/`) under PFD-SPEC-001 v2.0.

Pipeline: `topology.py` (frozen nodes/edges) -> `model.py` (streams.json) -> `sheet1.py`/`sheet2.py`
(via `pfdkit.py`, writing `out/PFD-20x-draft.svg`) -> copy to `out/PFD-20x-r1.svg` -> `verify.py` both sheets
(`--json out/verify-report.json`) -> `render.py` -> `pytest tests` -> `build_page.py` -> gh-pages `pfd-hda-example/`.
A changed sheet that has been published is re-issued under a new revision name (r2), never as r1.

## Lessons
- Library quirks (skill v2): `flash_1` lacks the Annex A.7 bottom liquid port (added in `symbols_ext`);
  `scds_1` overhead/bottoms ports lie 20/15 native units beyond the head apexes (kit draws nozzle stubs);
  `control_valve_1` frame top is 22 units above the actuator dome apex (end signals at the apex, y 507).
  The worked example in the skill shows the column-port gap and uses 4 mm tags (L2 allows 2.5-3.5 mm).
- Checks that the geometry battery cannot see came from rendered review and a process read: a purge
  joining a low-pressure header without a let-down valve, cooling water on the heating port, a level
  tap in the vapour space, stream temperatures far above their bubble points, vent compositions above
  the vapour-pressure limit. Do a process-sense review of the stream table, not only closure.
- R5 says "exceed 10 mm": the clear-spacing check must be strict (> 40 px at 4 px/mm).
- Header text must be in the label-overlap check (a lane under the subtitle touched it unnoticed).
- Verifier must join continuation streams across sheets for balances, and report (not crash on)
  missing table rows; the planted-defect tests in `tests/` guard both.
