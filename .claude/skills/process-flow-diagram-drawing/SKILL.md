---
name: process-flow-diagram-drawing
description: Draw, revise, or verify chemical process flow diagrams (PFDs) under specification PFD-SPEC-001, using the traced symbol library included in this skill. Use when asked to draw a PFD or process flowsheet from a process topology or simulation results from any source, to select named symbol variants for equipment, to lay out and orthogonally route streams, to render an SVG/PDF flowsheet, or to check a PFD for topology accuracy, balance closure, crossings, and bends.
---

# Process Flow Diagram Drawing

## Purpose

Draw a chemical process flow diagram (PFD) from a process topology, using
the traced symbol library included in this skill, laid out and verified
under the governing specification PFD-SPEC-001. The deliverable is a
vector drawing (Scalable Vector Graphics, SVG, and Portable Document
Format, PDF). This skill is procedural: the layout rules themselves live
in the specification and are referenced, not restated in full. The skill
is self-contained: no external software, simulator, or symbol library is
required, and stream values may come from any source — a simulation
result, a spreadsheet, a hand calculation, or values supplied directly.

All paths in this skill are relative to the folder containing this file
(the skill folder).

## When to use this skill

A request to draw, generate, revise, or check a PFD or process flowsheet
for a chemical process.

Not a trigger: piping and instrumentation diagrams (P&IDs), which carry a
different content level (pipe specifications, minor valves and fittings,
complete instrumentation) and are outside PFD-SPEC-001.

## 1. Governing documents and assets

Read the specification before laying out any sheet. Do not work from
memory of its rules.

- **Specification (normative).** PFD-SPEC-001 v2.0, "Layout of Process
  Flow Diagrams": `specification/pfd-layout-specification-v2.pdf`, with
  the editable source alongside it at
  `specification/pfd-layout-specification-v2.html`. Contents: accuracy
  requirements A1–A5, symbol requirements S1–S5, placement requirements
  P1–P8, routing requirements R1–R10, line-weight, lettering and
  labelling requirements L1–L6, sheet organisation and density
  requirements D1–D4, the nine-step layout procedure (Section 11),
  verification and acceptance (Section 12), and Annex A, the normative
  symbol catalogue (12 glyphs, each named by its library file), with a
  worked compliance record in Annex B and a pre-delivery checklist in
  Annex C.
- **Traced symbol library (normative for symbol geometry).** In
  `symbols/`:
  - `symbols/pfd_symbols.py` — Python module giving, for each of the 12
    catalogue symbols, the SVG geometry as a string in its native
    coordinate frame, its named ports, its frame, and its final-scale
    factor. Functions: `list_symbols()`, `get_svg(key)`,
    `get_ports(key)`, `get_frame(key)`. Standard library only.
  - `symbols/symbols.json` — the same metadata (ports, frame, scale
    factor, tracing basis) as data.
  - One standalone SVG file per symbol in `symbols/`, named by
    library key with the `.svg` extension.
  - `symbols/catalogue-sheet.png` — all 12 glyphs on one sheet for
    visual reference.
  - `symbols/verification-summary.md` — verification of the library
    under requirement S3 (tolerance 0.5 mm at final scale): 10 symbols
    Pass, 2 Conditional (`expander_1`, `vessel_1`); use the Conditional
    entries as supplied and record their status in the compliance
    record of any sheet that uses them.
  Library keys: `feed_1`, `product_1`, `pump_1`, `compressor_1`,
  `expander_1`, `heat_exchanger_1`, `flash_1`, `vessel_1`, `scds_1`,
  `kinetic_1`, `valve_1`, `control_valve_1`.
- **Worked example.** Benzene–toluene separation PFD, built end to end
  under this skill, in `example/`:
  - `example/build_pfd.py` — generates the SVG using the traced symbol
    library: every equipment glyph is a library symbol placed by a frame
    transform, and every stream endpoint is a transformed library port
    coordinate, asserted in code. Contains the balance-check function
    and the crossing and bend counters used in verification.
  - `example/render.py` — renders the SVG to PDF and PNG with Playwright
    and headless Chromium (A3 PDF at 420 mm × 297 mm, plus PNG for
    inspection). Requires Python with `playwright` installed and a
    Playwright Chromium browser (`playwright install chromium`).
  - `example/sample-pfd-v4.svg`, `example/sample-pfd-v4.pdf`,
    `example/sample-pfd-v4.png` — the delivered sample sheet. Measured
    result: 0 crossings, 6 total bends, maximum 1 bend per stream, total
    routed length 2763 drawing units, all balances closing on displayed
    values. The stream values are illustrative sample values, labelled
    as such on the sheet.

## 2. Symbol use

Draw every equipment item with a library symbol. Name the variant for
every equipment item by Annex A catalogue entry and library key (for
example, A.6, `heat_exchanger_1`), as requirement S2 demands; a request
that names only the equipment type is incompletely specified — establish
the variant before drawing. Place symbols by frame transform from the
library, and terminate every stream at a transformed library port
coordinate, never at an estimated point on the outline. An equipment
type absent from Annex A is drawn from ISO 10628-2 under the same
fidelity rule (requirement S5) and added to the catalogue at the next
specification revision before a second use. Instrument and control
symbols follow ANSI/ISA-5.1.

## 3. Workflow

Apply the specification Section 11 procedure, in order. Layout work
begins from the process result, never from a prior drawing.

1. **Extract the topology.** Node list (equipment items), edge list
   (streams), port assignment at every stream end, and flow direction
   of every stream, from the process result supplied for the task.
   Topology is fixed; no later step may create, delete, merge, split,
   redirect, or re-terminate a stream.
2. **Select named symbol variants.** One Annex A entry per equipment
   item, recorded by catalogue entry number and library key.
3. **Order and place.** Nodes in topological order along the main path,
   grouped by process section; template groups placed as units (the
   distillation column template of requirement P5 is normative: column
   centre, condenser above, reflux drum at condenser elevation, reflux
   return on a vertical lane, reboiler below, boilup return at the
   column base); remaining nodes on the common grid, vertical position
   reflecting approximate relative elevation, size reflecting
   approximate relative size.
4. **Assign lanes and route.** Lanes ordered by destination; spine
   first, template-internal streams second, remaining process streams
   third, recycle and utility streams last on perimeter lanes. Routing
   is orthogonal only (horizontal and vertical segments), meeting every
   port along its axis. Resolve conflicts in the specification priority
   order, which is fixed and evidence-based: **crossings first, then
   bends, then total routed length and area, then alignment and
   symmetry**. A predicted crossing is removed by re-placement, then by
   lane reassignment, and only then accepted under the crossing-drawing
   rule.
5. **Label.** Equipment designations and service names at the fixed
   position for each symbol family; stream numbers in diamond markers
   on horizontal segments; arrowheads at every inlet, after the final
   bend of a long stream, and upstream of every branch; stream table
   below the flowsheet, one row per stream in number order, the unit of
   every quantity stated in its column heading in words or in a symbol
   defined at first use; title block clear of flowsheet, table, and
   equipment summary. Split the process across sheets rather than
   reducing type, spacing, or symbol size when density limits are
   reached.
6. **Render.** Generate the SVG from the builder script; render the PDF
   at the fixed final sheet size and a PNG at inspection resolution.
   All layout quantities (line widths, spacings, lettering heights) are
   specified at final scale; design at final size, never shrink to fit.
7. **Verify** (Section 5). Any failure returns the sheet to the relevant
   step; a corrected sheet is re-delivered under a fresh, versioned
   filename — never re-deliver changed content under a previous
   filename.

## 4. Extensive drawings: parallel work with sub-agents

**Comment on extensive drawings.** When a drawing is very extensive —
several process sections, several sheets, or of the order of 25 or more
equipment items and 40 or more streams — the work should be done in
parallel using multiple sub-agents. **Use no more sub-agents than
necessary to achieve good accuracy.** Parallel work is a means to
accuracy on large sheets (smaller individual scopes, independent
checking), not an end in itself; a drawing of modest size is done by a
single agent.

Rules for parallel work under this skill:

- One coordinator owns the task end to end. The coordinator first
  freezes the topology (step 1) and the symbol variant selection
  (step 2) and issues them to every sub-agent as fixed inputs; no
  sub-agent may alter topology or substitute a symbol variant.
- Split by genuinely separable scope only: one sub-agent per process
  section or per sheet for placement and routing of that scope, working
  from the same frozen topology, the same symbol library, and the same
  specification. Global lane assignment across section boundaries stays
  with the coordinator.
- Verification may be split in parallel with production: an independent
  sub-agent re-runs the hard-failure checks (Section 5) on the
  assembled sheet. The final verification battery is always run once,
  by the coordinator, on the assembled drawing as a whole — section
  results do not substitute for it.
- Do not split a single template group (for example, a column with its
  condenser, reflux drum, and reboiler) across sub-agents; template
  integrity is a single scope.
- Each additional sub-agent beyond the separable scopes adds
  coordination and integration risk without adding accuracy. Stop at
  the smallest number that covers the separable scopes, plus at most
  one independent verifier.

## 5. Verification and acceptance

Two classes, per specification Section 12. **Hard failures** have an
acceptance limit of zero; **quality scores** are measured and recorded.

Hard failures (zero permitted):

- Topology difference: node list, edge list, or port assignment of the
  drawing differs from the supplied topology (A1, A2). Check by
  automated graph comparison, not by eye.
- Identity mismatch: a stream number, equipment designation, or stream
  table row missing or duplicated (A4). Check by automated cross-count.
- Non-closing balance: any unit balance or the overall balance formed
  from the **displayed** values fails to close within the rounding of
  the least precise displayed value (A5). Recompute from displayed
  values, as in the `check_balance` function of the worked example.
- Label overlap (label against line, symbol, or label), a line
  transiting a symbol or table, a parallel-line spacing violation, a
  junction dot at a crossing, or a missing junction dot at a genuine
  junction.

Quality scores (measure from the drawing geometry and record in the
compliance record): number of crossings, total number of bends, maximum
bends on any single stream (acceptance limit 2), total routed length,
and minimum clear spacing between parallel lines. Every surviving
crossing carries a recorded justification naming the placement and lane
alternatives examined.

Rendered inspection is mandatory and separate from the geometric checks:
inspect the full sheet at final size and magnified regions covering
every template group. The worked example's history is the standing
lesson — early drafts passed the numeric checks and were rejected on
rendered inspection (label overlaps, a liquid fill protruding past a
vessel outline, a title block overlapping a table). Code inspection
alone is not verification.

## 6. Honesty rules

- Stream values on a sheet are the values of the process result the
  sheet was generated from. Illustrative or assumed values are labelled
  as sample values **on the sheet itself** and are never presented, in
  the sheet or in the handover, as a converged simulation result.
- Engineering caveats belong in the handover message, not inside the
  delivered drawing; the drawing presents the specified content only.
- Report measured quality scores as measured. A sheet that does not
  reach the reference standard (0 crossings, maximum 1 bend per stream)
  is delivered with its actual scores and the crossing justifications,
  not with an unqualified claim of compliance.

## 7. Handover

Deliver the SVG (source of truth), the PDF at final sheet size, and a
PNG for immediate viewing, each under a versioned filename. State in
the handover: the library key named for every equipment item; the
measured quality scores and the hard-failure checks performed; whether
the stream values are a supplied process result or labelled sample
values; whether the work was split across sub-agents and, if so, the
split used; and anything not verified, labelled as an expectation. If a
process result is still outstanding, name it as the remaining step
rather than letting the drawing imply it exists.

## 8. References cited by the specification

- ISO 10628-1:2014, Diagrams for the chemical and petrochemical
  industry — Part 1: Specification of diagrams.
- ISO 10628-2:2012, Diagrams for the chemical and petrochemical
  industry — Part 2: Graphical symbols.
- ANSI/ISA-5.1-2009, Instrumentation Symbols and Identification.
- Purchase, H. C. (1997), "Which aesthetic has the greatest effect on
  human understanding?", in Graph Drawing, Lecture Notes in Computer
  Science Vol. 1353, pp. 248–261, Springer,
  DOI 10.1007/3-540-63938-1_67.

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
