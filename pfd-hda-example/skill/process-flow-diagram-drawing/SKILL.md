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
