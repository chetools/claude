
---

# Addendum A — Lessons from a full build (toluene HDA plant, 2026-10-25)

**To agents and maintainers using this skill.** This addendum records what the
skill's procedure did not prevent during a complete build of a process page. The
page covered a toluene hydrodealkylation (HDA) plant: two PFD sheets, 22 equipment
items, 41 streams and a recycle loop with purge. It had a four-input live model,
a 13-section Theory panel with seven sub-process crops, a Code panel and a MoLab
notebook. The work was split across parallel sub-agents under one coordinator.

Sections 13 to 19 are written to be appended to `SKILL.md` as they stand. Every
number quoted was measured in that build.

The worked example is published at
<https://chetools.github.io/claude/pfd-hda-example/hda-plant-v1.html>, with its
sources in <https://github.com/chetools/claude/tree/master/pfd-hda-example/page>.

## 13. The model as single source

- **One module for the sheet and the page.** The script that produces the sheet's
  stream values imports the page's `balance.py`; it does not keep its own copy of
  the unit rules. After any model change, regenerate the stream data and the sheet
  SVGs. Accept the change only if both are byte-identical to the issued versions,
  or issue a new sheet revision. A second copy of the rules drifts silently.
- **Solve recycle loops directly.** A component-balance flowsheet with fixed split
  fractions, fixed conversion and fixed recoveries is affine in its tear variables
  (recycle flows and any make-up rate set by a specification). Its steady state is
  therefore the solution of one small linear system. Build the Jacobian from one
  base pass plus one unit perturbation per tear variable, then solve with Gaussian
  elimination in pure Python, so the code runs unchanged in Pyodide.
  - In the worked example (11 tear variables) this took under 1 ms.
  - Successive substitution needed thousands of passes at low purge fractions.
- **Two methods, and the second is a test, not the solver.** Keep successive
  substitution as the independent check. Assert agreement on a grid over the whole
  input range, including the corners. The worked example used 108 points and the
  methods agreed to 1e-10 relative to the feed. In the same sweep also assert:
  - no negative flow;
  - closure of the overall element balances;
  - a plain-language `ValueError` for every invalid input class (out of range,
    non-numeric, NaN).
- **Two arithmetics for the same rules.** Displayed values come from an
  integer-arithmetic run at the displayed precision. Every split is rounded and
  its last outlet is taken by difference, so every displayed balance closes
  exactly (§1, input 2). The live model runs the same rules in floating point.
  - State the largest difference between the two on the page, computed at build
  time and never typed by hand; it was 0.78 kmol/h in the worked example.
  - Test that this difference stays below a stated bound.
- **Expose only inputs whose whole range has been swept.** Publish the range of
  every input and enforce it in the model, not only in the HTML controls.

## 14. Process plausibility review (required before delivery)

Passing closure, topology and layout checks does not make a flowsheet right. In
the worked example, every automated check passed while the design basis contained
five process errors, found only by an independent reviewer who read the stream
table and the drawing as a process engineer:

- a purge at 2,350 kPa joining a 280 kPa fuel-gas header with no let-down valve;
- cooling water on the heating side (bottom connection) of an exchanger;
- a level tap in the vapour space of a separator;
- column-bottom temperatures of 270 °C, against a computed bubble point of 134 °C;
- a condenser vent carrying 43 mol% benzene at 45 °C and 200 kPa. Benzene's
  vapour pressure of 29.8 kPa caps it near 15 %.

Before delivery, run and record this review:

1. **Pressure.** Every junction's inlets are at or above its outlet pressure.
   Every drop much larger than line losses has a valve or a machine on the sheet.
   Pressure rises only across pumps and compressors.
2. **Temperature and phase.** Compute bubble and dew points of the displayed
   compositions (Raoult's law with Antoine constants is sufficient for a sample
   design) and set column temperatures from them. Then check that:
   - liquids are at or below their bubble point;
   - vapours are at or above their dew point;
   - phase labels agree.

   Keep the computation as a test that asserts each column temperature lies within
   a stated tolerance of its computed value.
3. **Composition limits.** The vapour mole fraction of each condensable component
   is at most its vapour pressure divided by the total pressure. Keep this as a
   test too.
4. **Connections.** Vapours leave tops and liquids leave bottoms. Feeds enter
   above liquid levels. Cooling utilities connect at the top and heating
   utilities at the bottom. Level taps sit at the liquid and pressure taps in the
   vapour. Every control valve has its controller and a measurement connection.
5. **Comparison with the sources.** Where the sample design departs from the
   cited process conditions, the Theory text states the departure with numbers:
   inlet temperature, pressure, feed ratio, product purity, and the absence of a
   quench or of heat integration.

Assign this review to a sub-agent that had no part in the design. Ask it for
process plausibility explicitly, not only for "correctness".

## 15. Research dossier and Theory text

- **The dossier is the only source of external facts.** Record, for every
  reference:
  - the bibliographic data;
  - how it was verified (Crossref, publisher page, or agency page);
  - the exact facts read in it ("verified facts").

  Any fact that is not among the verified facts of a reference that was actually
  read stays off the page. It is not hedged or qualified; it is omitted. A source
  known only by its bibliographic record (an unread textbook) may be cited for its
  existence or its role in the field, never for a technical fact.
- **Brief the Theory writer with the builder's exact formats**, because a
  mismatch costs a conversion pass:
  - citation syntax, for example `[1] [2]` and never `[1, 2]`;
  - reference-list syntax, for example `1. text`;
  - the mathematics marker rule of §6;
  - the crop directive syntax;
  - the slug rule for heading identifiers.
- **Numbers in the text are computed, not written.** The writer quotes model
  values from the model and source values from the dossier, and runs every unit
  conversion. The independent review recomputes all of them. In the worked
  example this found a percentage taken of the wrong base (a price spread quoted
  as 33 % of the toluene price; it is 49.7 % of the toluene price and 33.2 % of
  the benzene price).
- **Source wording, not stronger wording.** A paraphrase must not strengthen
  the source. In the worked example, "hydrocracking begins above 700 °C" had to
  become the source's "a significant amount of hydrocracking takes place". A
  claim that named specific equipment as exposed to hydrogen attack had no source
  and was replaced by computed hydrogen partial pressures and the source's own
  findings.
- **No self-reference on the page (§10).** Sentences such as "was not verified",
  "no source was found", or "the page does not compute…" belong in the handover.
  State the model's limits positively, for example "The model has no energy
  balance; temperatures are nominal sample values."
- **Name unlabelled drawing elements by what they connect.** If the sheet does
  not label junctions or other features, the text describes them, for example
  "the junction where streams 1 and 37 meet", and does not use internal names
  that the reader cannot find on the drawing.

## 16. Sub-process diagram crops (additions to §5)

- **Measure, do not estimate.** Load the sheet SVG in the browser and read the
  bounding box (`getBBox`) of every label and symbol group near a proposed window
  edge. Place each edge in a measured gap.
  - In the worked example, five of seven windows chosen from the rendered picture
    clipped a label or cut neighbouring equipment.
  - One window had no gap that kept every label whole, and only the measured
    extents showed the one acceptable edge.
- **Check what enters the window as well as what leaves it.** A window may
  include a stray stream, a sheet subtitle or a sliver of the next symbol. Either
  remove it or name it in the caption.
- **Inspect every crop as a screenshot** after the final text is in. Captions
  change during review, and windows must be re-checked against them.

## 17. Page layout lessons (additions to §2 and §8)

- **Two phone-overflow causes not covered by the chart refit of §2:**
  - Long unbreakable strings, such as URLs in the reference list. Fix with
    `overflow-wrap: anywhere` on the prose column.
  - Grid or flex children without `min-width: 0`. The text column grows to its
    widest content, even when that content sits in a scrolling container. Give
    every grid child of the panel layout `min-width: 0`.

  Neither appeared with the stub text. Both appeared only with the final text, so
  run the phone-width battery after the final text is merged, not only during
  infrastructure work.
- **To find an overflow, bisect.** Hide each top-level block of the panel in turn
  and re-measure the document scroll width. Element-box searches miss overflowing
  text.
- **A self-test of the live path.** Give the page a `?selftest` option. After
  Pyodide boots, it reruns the design basis live and compares every number
  embedded for first paint, then sets a scriptable verdict (`window.SELFTEST`).
  In the worked example it compared 151 numbers with zero difference, which
  proved that the browser path and the build path are the same computation.
  Run it on the published URL as well as locally.
- **WASM walkthrough label.** marimo's `html-wasm` export runs the notebook in
  the reader's browser; it is not pre-run. Label the link "read-only walkthrough
  (WASM)", not "pre-run".

## 18. Coordinating sub-agents (additions to §9 and to the parallel-work rules of the diagram skill)

- **Freeze more than the topology before splitting.** Issue these as read-only
  shared inputs before any sub-agent starts:
  - the model;
  - the drawing kit;
  - the checker;
  - the build conventions (formats of §15).

  In the worked example, the infrastructure, research and Theory sub-agents then
  integrated with only one format conversion.
- **Fix shared values with the most constrained output in view.** Values that
  two sub-agents' outputs must share, such as sheet-continuation heights, are
  fixed by the coordinator once the most constrained output is laid out. They are
  not given as a range in advance. An advance range put a column feed at the
  bottom tray.
- **Re-verify reports against the final files.** A sub-agent's report that it
  inspected the render often refers to an earlier draft. Before issue, the
  coordinator rebuilds from source, checks that the deliverables are
  byte-identical to that build, and looks at the final screenshots itself.
- **Stop sub-agents explicitly once their work is integrated.** A finished agent
  with background work may resume, rebuild over the coordinator's edits, or stop
  shared processes. In the worked example one shut down a test server that was
  in use. Each agent uses its own server port and stops only processes it started,
  by PID.
- **Keep working output out of version control until the final run.** Repeatedly
  rewritten screenshots make a clean working tree impossible. Ignore the
  screenshot folder while building and commit the final set after the last
  verification run.

## 19. Verifying the checkers

- **A checker is trusted only after it has failed on purpose.** Keep a
  planted-defect test suite. It copies the delivered artefacts, plants one defect
  per test, and requires the matching failure. In the worked example the defects
  were:
  - a displayed value changed by one unit of its last digit;
  - a table row removed;
  - a stream-number marker removed;
  - a stream end moved off its port;
  - a label placed on a line;
  - a broken embedded Python script for the boot guard of §6.

  These tests exposed a crash that would have masked all other results, and two
  gaps: continued streams were not joined across sheets in the balance check, and
  header text was missing from the overlap check.
- **"Shall exceed" is a strict inequality.** A clear spacing of exactly 10.0 mm
  passed a check written as `>=` against a limit of "more than 10 mm".
- **Rule out the test before the code.** Earlier false failures came from:
  - a test against a server that another process had stopped;
  - a stale build served from a previous run;
  - a test constant left behind by a refactor.

  Re-run with a fresh server and a fresh build before diagnosing the page.

*End of Addendum A.*
