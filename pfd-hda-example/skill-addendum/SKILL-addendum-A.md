
---

# Addendum A — Lessons from first external use (2026-10-24)

**To the maintainer of this skill.** This addendum reports what happened when the
skill was used, as supplied (export v2, PFD-SPEC-001 v2.0, symbol library v1), on a
real plant: a toluene hydrodealkylation (HDA) process drawn on two A3 sheets. The
drawing had 22 equipment items, 41 streams, two column templates, a gas recycle
loop and two control loops.

The delivered sheets passed the full Section 5 battery: 0 hard failures,
N<sub>c</sub> = 0, b<sub>max</sub> = 2, and every balance closing on displayed
values. Even so, the sheets that first passed that battery contained five process
errors and several drafting defects. Rendered inspection or a separate process
review found them. Sections 9 to 15 below are written to be appended to `SKILL.md`
as they stand. Section 16 lists proposed corrections to the library, the
specification and the worked example, with exact values. Every number below was
measured from the library files or from the drawing geometry; nothing is quoted
from memory.

The worked case can be inspected at <https://chetools.github.io/claude/pfd-hda-example/>.
Its source, including the verifier and the planted-defect tests, is in
<https://github.com/chetools/claude/tree/master/pfd-hda-example>.

## 9. Library corrections to apply before drawing

Apply these at load time, in a project-local wrapper module. Do not edit the library
files. Record each one in the compliance record.

| Symbol | Defect | Correction |
|---|---|---|
| `flash_1` (A.7) | Annex A.7 says the liquid outlet is "at the bottom", but the port list has no bottom port (it has `side_1`…`side_6`, `top` and `right`). | Add `bottom = [308, 518]`, the lower head apex. It lies on the outline: the arc ends at y = 489 and its depth is 29. It also equals the frame bottom. |
| `scds_1` (A.9) | The `overhead` port (560, 200) lies 20 native units above the top head apex (y = 220). The `bottoms` port (560, 520) lies 15 units below the bottom apex (y = 505). A stream ending at the port therefore stops short of the column. The worked example shows this as a visible gap of about 25 px at the column top and bottom. | Keep the stream end on the port. Draw a nozzle stub from port to apex at main-line weight, inside the symbol group. |
| `scds_1` (A.9) | Feed, reflux and boil-up entries are described in Annex A.9, but they have no named ports. | Use virtual ports `side_left` and `side_right`: a point on the shell edge (x = 530 or 590), at a height chosen by the layout, restricted to the straight shell (y 235–490). The verifier must recognise them. |
| `control_valve_1` (A.12) | The frame top (y = 485) is 22 units above the actuator dome apex (y = 507). A signal line ended at the frame top stops short of the actuator. | End instrument signal lines at the dome apex: (576 − 507) × scale above the port centreline. |
| All symbols | Stroke widths are fixed in native units for each symbol's library scale. At any other placement scale they drift. In the worked example the flash drum outline renders at 0.97 mm, the column at 0.73 mm and the reflux drum at 0.39 mm, against 0.5 mm required by L1. | Rescale every `stroke-width` at placement by (target width in px) ÷ (placement scale × native main stroke). This keeps the internal weight ratios. Use 0.5 mm for equipment and 0.25 mm for valves. |

## 10. Specification interpretations

The specification is silent or ambiguous on these points. Apply this reading and
state it in the compliance record.

- **R5 "shall exceed 10 mm"** is a strict inequality. A clear spacing of exactly
  10.0 mm fails. Implement it as `gap > 40 px` at 4 px/mm, not `>=`. A layout sat
  exactly on the limit and passed the first verifier.
- **A.6 utility side.** Cooling utilities connect to the **top** port and heating
  utilities to the **bottom** port. A reboiler whose top port carries boil-up
  takes its heating medium at the bottom. A fired heater takes fuel at its fuel
  port. Check this automatically: a cooling-water stub on the bottom port was
  missed by eye in a first issue.
- **Column entries relative to trays (A.9, P5).** Reflux enters above the top tray
  line, boil-up enters below the bottom tray line, and a feed enters between two
  tray lines, never on one. Assert this in the builder.
- **L4 "clear of arrowheads".** Quantify it as at least 1 mm (4 px) between the
  marker outline and any arrowhead; 1.5 mm is preferred. A marker 0.5 mm from an
  arrowhead reads as touching.
- **L3 overlaps include sheet text.** The overlap check must cover the title,
  subtitle, notes and table captions as well as equipment labels. A process lane
  under the subtitle touched it without any check firing.
- **Principal control loops (A3, S4).** A loop is complete only with all three
  parts shown:
  - the measurement connection to the process, with a level tap at the liquid
    level and a pressure tap in the vapour space or on the line;
  - the controller bubble;
  - the signal to the valve actuator.

  A bubble wired only to its valve is incomplete.
- **Terminal labels.** Choose one side per terminal family (for example,
  product and continuation labels above the glyph) and keep it on every sheet of
  a set.

## 11. Process-sense review: a required step after the geometric battery

The Section 5 battery verifies the drawing against the topology and the displayed
values against closure. It cannot see an error that is consistent with both. On
the HDA sheets these errors passed every automated check:

- a purge at 2350 kPa joined a 280 kPa fuel-gas header with no let-down valve;
- the effluent cooler had cooling water on its heating port;
- the level tap sat in the vapour space;
- toluene-column bottoms were shown at 270 °C, while the computed bubble point of
  the displayed composition is 134 °C;
- the condenser vent carried 43 mol % benzene at 45 °C and 200 kPa. Benzene's
  vapour pressure of 29.8 kPa (Antoine) caps this at 15 %.

Before delivery, read the stream table and the drawing together as a process
engineer, and record the result. The minimum checklist:

1. **Pressure.** Where streams join, every inlet is at or above the outlet
   pressure. Any drop much larger than line losses has a valve or a machine on
   the sheet. Pressure rises only across pumps and compressors.
2. **Temperature and phase.**
   - Liquids are at or below their bubble point at the displayed pressure.
   - Vapours are at or above their dew point.
   - Column overheads and bottoms sit near their saturation temperatures.
   - The phase label agrees with all of this.

   Compute bubble points (for example Raoult's law with Antoine constants)
   rather than judging by eye, and keep the calculation as a test.
3. **Composition limits.** Vapour mole fractions of condensable components do
   not exceed vapour pressure ÷ total pressure at the displayed temperature.
4. **Port sense.**
   - Vapours leave from tops and liquids from bottoms.
   - Feeds enter above the liquid level.
   - Utilities are on the correct side (§10).
   - Instrument taps are in the correct phase.
5. **Values that are not results.** Values not produced by a calculation are
   labelled on the sheet as nominal or sample values. This is §6, restated here
   because it is easy to forget for temperatures and pressures.

An independent reviewer found most of these errors. That reviewer had no part in
the layout and was asked only for process plausibility. Use such a reviewer in
addition to the verifier of §4, not in place of it.

## 12. Verifying the verifier

A verifier that reports zero failures proves nothing until it has failed on purpose.

- **Planted-defect tests.** Keep these as a test suite run on every delivery. Each
  takes a copy of the delivered sheets, plants one defect, and requires the
  matching failure code:
  - a displayed value changed by one unit of its last digit (A5);
  - a stream-table row deleted (A4);
  - a stream-number marker deleted (A4);
  - a stream end moved off its port (A1);
  - a label placed on a line (L3).

  The deleted-row test exposed a crash in the balance step that would otherwise
  have masked every other result.
- **Re-derive topology from geometry.** Do not trust metadata written by the
  builder. Match each drawn line end to a transformed library port, then compare
  the resulting edge list with the topology.
- **Multi-sheet balances.** Join continued streams across sheets before forming
  balances. Otherwise the receiving unit appears to have no inlet.
- **Exact closure under rounding (A5).** To make every balance close exactly on
  displayed values, compute the balance twice:
  - once in floating point, as the reference;
  - once in integer units of the displayed precision, rounding every split and
    taking its last outlet by difference.

  Display the integer result and test that it stays within a stated tolerance of
  the reference. On the HDA case the two agreed within 0.8 kmol/h.

## 13. Sheet continuations (R9) in a multi-sheet set

- Fix continuation heights **after** placing the most constrained sheet, or
  jointly with it. A height range chosen in advance for the receiving sheet put
  a column feed at the bottom tray, beside the boil-up return. That is a process
  error, and no check caught it. It was found on rendered inspection.
- Store continuation heights in one shared file that every sheet builder reads.
  Verify equality across sheets geometrically.
- A continued stream keeps one number on both sheets, and appears in both stream
  tables with identical values. Verify that the rows are identical.

## 14. Parallel work: additions to Section 4

- Freeze more than the topology and symbol selection. Freeze the drawing kit
  (placement, stroke rescaling, marker, arrow and table helpers) and the verifier
  as well, and issue them read-only to every sub-agent. Two sheet agents then
  produce sheets that integrate without rework.
- A sub-agent's report that it "inspected the render" often refers to an earlier
  draft. Before issue, the coordinator rebuilds every sheet from source, checks
  that the delivered file is byte-identical to the fresh build, and inspects the
  final renders itself.
- The split that worked for 22 items and 41 streams on two sheets:
  - one sub-agent per sheet;
  - one sub-agent for new S5 symbols;
  - one independent verifier.

  The coordinator owned the topology, the model, the kit, the verifier and the
  continuation heights.

## 15. Drafts and issued revisions

Under §3 step 7, changed content is never re-delivered under a previous filename.
Read that rule together with this convention:

- Build iterations write `<sheet>-draft.*`, which are not delivered.
- The first issued sheet is `<sheet>-r1.*`.
- Any change after issue becomes `-r2`, and so on.
- A sheet that has not left the project can be corrected before issue without
  bumping the revision.

## 16. Proposed corrections for the next release

**Library (v2):**

- `flash_1`: add port `bottom: [308, 518]` to `pfd_symbols.py` and `symbols.json`.
- `scds_1`:
  - either move the `overhead` and `bottoms` ports onto the head apexes,
    (560, 220) and (560, 505);
  - or keep them and include the nozzle stubs in the glyph.
  - Add named side-entry ports, or document the side-entry convention of §9.
- `control_valve_1`: either set the frame top to the dome apex (y = 507), or add an
  `actuator` port at (605, 507).
- `symbols.json`: record each symbol's native main stroke width, so that users can
  rescale it at placement.
- Annex A gains entries for a **fired heater** and a **fixed-bed (packed)
  reactor**, which most reaction sections need.
  - They were drawn here as provisional S5 additions. They were not verified
    against ISO 10628-2.
  - Their geometry and ports are in `symbols_ext.py` of the worked case:
    - fired heater: frame 100 × 268, `coil_in` and `coil_out` at mid-height on
      the box walls, `fuel` at the bottom;
    - reactor: frame 116 × 268, 2:1 heads, ports `top` and `bottom` at the
      apexes.

**Specification (v2.1):**

- R5: state the strict inequality and the reference (centre distance minus
  line widths).
- A.6: state the utility port rule of §10.
- A.9: state the tray-relative entry rule.
- L4: quantify "clear of arrowheads".
- L3: state that title, notes and captions are labels.
- Section 12: add the process-sense review (§11) as a recorded step.
- Section 12: add the planted-defect requirement on the verifier (§12).

**Worked example (`example/`):**

- Its sheet uses a 3.4 px main line (0.85 mm) where L1 requires 1.0 mm, and
  1.3 px utility lines (0.33 mm) where L1 requires 0.5 mm. Equipment tags are
  16 px (4.0 mm), above the 3.5 mm maximum of L2.
- Symbol strokes vary between 0.39 and 0.97 mm (§9).
- The column top and bottom show the port gap (§9).
- Re-issue the example with these corrected, so that it demonstrates the
  specification it accompanies.

*End of Addendum A.*
