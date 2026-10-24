---
name: chemical-process-wasm-page
description: Build a standalone, serverless educational web page for a chemical process — a process flow diagram sheet at the centre of an App panel, a live Python balance model anchored on a verified design basis, a subunit-by-subunit breakdown with a sub-process diagram per subunit, economics and safety content from a cited research dossier, a Code panel with listings and a marimo walkthrough, and an editable notebook on a MoLab link. Use when asked to build a WASM or Pyodide page about a chemical plant or process unit (for example an ammonia plant, a distillation unit, an air separation unit), or to revise, verify, or republish such a page.
---

# Chemical Process WASM Page

## Purpose

Build one standalone, serverless educational page for one chemical
process. The page teaches the process from its process flow diagram
(PFD): the completed sheet is the centrepiece of the App panel, a
live Python balance model lets the reader vary the operating point
around a verified design basis, and a breakdown panel explains every
subunit in diagram order with its own sub-process diagram. The page
runs entirely in the reader's browser (Python through Pyodide, the
Python runtime compiled to WebAssembly, abbreviated WASM); no server
is required, and every calculation is performed in Python — there is
no JavaScript calculation fallback, and a failed runtime shows an
explicit error instead of substitute results.

This skill is the process-page specialisation of a general WASM
educational page skill (which governs algorithm pages built around a
numerical solver). It assumes two companion skills and does not
restate them: the process flow diagram drawing skill, under its
governing specification PFD-SPEC-001, for the sheet itself; and the
code-panel and marimo-breakdown skill, for the Code panel mechanics
and the notebook pair. Rules inherited from those skills that a
process page most often breaks are restated here in §7 and §8 because
they are load-bearing for this page type.

Worked examples built under this skill (the reference set for every
rule below): an air separation unit (seven-panel form), and ammonia
synthesis, crude oil atmospheric distillation, and methanol synthesis
plants (three-panel form). Provenance detail for the reference set —
design-basis anchors, crop windows, and defect histories — is
recorded in §11.

## When to use this skill

A request to build, revise, verify, or republish an interactive page
about a chemical plant, process unit, or process section, where the
subject is the process (its flowsheet, balances, subunits, economics,
and safety), not a numerical algorithm. For algorithm pages (a
solver, a discretization, a simulation method), use the general WASM
educational page skill instead.

## 1. Inputs, established before building

A process page is built from three inputs. Building starts only when
all three exist; a missing input is produced first, not improvised
during the build.

1. **Research dossier.** A verified written record covering: the
   process description by subunit, in diagram order; reactions and
   catalysts; operating conditions per subunit; production scale
   (national and worldwide, with the basis year); process economics
   (capital cost, operating cost, product value, with the basis year
   and capacity basis of every figure); safety and environmental
   issues; and issues of special concern specific to the process.
   Every factual claim in the dossier carries a citation. Facts that
   will appear on the page are verified against the source record
   (publisher, standards body, or primary document) before use, not
   after drafting.
2. **Design basis.** One steady operating point for the whole
   process, stated as stream values on the flowsheet, in which the
   overall balance closes exactly on the values as displayed, and
   every unit balance closes on displayed values under the balance
   rule of the diagram specification (compute splits in integer units
   of the displayed precision and take the last outlet by difference,
   so closure is exact, not approximate). Where the values are
   illustrative rather than the output of a simulation, they are
   labelled as sample values on the sheet and in the page text, and
   are never presented as a converged simulation result. The design
   basis is the anchor of the page's model (§4): the precomputed run
   displayed on load is this operating point, and the model's tests
   assert its closure numbers.
3. **The sheet.** The PFD itself, drawn under the diagram skill and
   its specification (topology extracted from the process, named
   symbol variants, orthogonal routing, verification by graph
   comparison, balance closure on displayed values, measured crossing
   and bend counts, rendered inspection), delivered as a scalable
   vector graphics (SVG) file. The page embeds this file; the page
   build never redraws or edits the sheet.

Ask the open design questions once, in one batch, each with a
recommended option, before building: the exact process scope and
battery limits; the panel form (§2, three-panel recommended); the
model's variable inputs (§4); the repository and publication target.
Proceed on the recommendation for anything left unanswered, and list
the defaults used in the handover.

## 2. Page anatomy

Two panel forms are in use. Both carry the same content; the choice
is made by content length.

- **Three-panel form (default).** Panels: App; Theory; Code. The
  Theory panel carries, as headed sections under one table of
  contents: the process description by subunit (§5); production
  scale; process economics; safety and environmental issues; issues
  of special concern; and the reference list.
- **Seven-panel form.** Panels: App; Process; Theory; Economics;
  Safety; Code; References. Selected when the economics, safety, or
  reference material is long enough to stand alone, or when the
  breakdown belongs in a Process panel distinct from a Theory panel
  that carries derivations. The subunit breakdown (§5) lives in the
  Process panel in this form and in the Theory panel in the
  three-panel form.

Rules for both forms:

- **App panel.** The full sheet, embedded from the sheet SVG file,
  at a size legible without zooming on a desktop display and
  pannable or scrollable on a phone; an equipment index keyed to the
  diagram tags (each entry names the tag, the service, and the
  Theory or Process section that explains the item, linked by
  fragment); and the live balance model (§4) with its inputs, its
  outputs as metric cards and charts, and the design-basis run
  displayed on load.
- **Sticky main panel selection tabs (no exceptions).** The tab bar
  that switches panels stays at the top of the viewport for the whole
  page scroll. Implementation: `position: sticky; top: 0` on the tab
  bar, a z-index above panel content (60 in the reference set), an
  opaque background matching the page background, the tab bar a
  direct child of the full-height wrapping column with no
  `overflow: hidden` or `overflow: auto` ancestor; every sticky
  in-panel table of contents offset below the stuck bar (top of
  approximately 56–64 px, maximum height reduced by the same amount);
  every fragment target carrying a `scroll-margin-top` of at least
  the stuck bar height plus a gap; on phone widths the bar may wrap
  to two rows, remains sticky, and produces no horizontal scroll.
  Verification is in §8.
- **Tables of contents.** Every long panel carries one, built from
  the rendered headings, sticky and scrollable on desktop with the
  current section highlighted, collapsed as a Contents block above
  the text on phones. The Code panel's contents is built the same
  way from its listing and walkthrough headings. The build fails when
  a panel has no headings to build its contents from.
- **Fragments.** Every panel and every headed section within a panel
  has a URL fragment identifier (a shareable address). Opening the
  page with a fragment displays that panel and section; in-page
  navigation updates the address.
- **Header width.** The page header (title, introduction, status or
  progress bar) sits in one block with the same maximum width as the
  body column, set in the body font, so header and body share left
  and right edges on wide monitors.
- **First paint.** The App panel does not open empty: the
  design-basis run is computed at build time and its outputs (metric
  values and chart data) are embedded in the page and rendered on
  load with no Python execution. Live controls stay disabled until
  the Python runtime has booted; a stale note appears when the
  displayed inputs diverge from the displayed results; if the runtime
  fails to load, the precomputed run stays visible and the error
  states that the displayed results are the precomputed design basis.
- **Register and symbols.** Journal-formal register throughout:
  nominal, impersonal headings; no hype, no conversational fragments,
  no anthropomorphising; no prompt-derived commentary inside the
  page. Every symbol (a letter or sign standing for a quantity) is
  defined at or before its first use, with SI units (the
  International System of Units) where applicable — in prose,
  equations, captions, tables, figures, and code shown to the reader.
  A symbols table does not substitute for definition at first use.

...[truncated 19642 chars]- **Plot style.** Plotly is the default plotting library. Legends
  sit outside the plot area; axis titles, tick labels, and legend
  entries are short, with symbols defined in the surrounding prose;
  colour is always double-encoded (colour plus marker, line style, or
  label) so figures remain readable in grayscale; no in-figure
  titles. After the first render and again on window load, every
  chart is refitted (`Plotly.Plots.resize` on each chart element):
  Plotly measures containers before a flex layout settles and
  otherwise falls back to a 700 px default width, silently
  overflowing phone viewports (§11).

## 3. Project layout

One directory per process page, laid out as in the reference set:

```
template.html        page shell: header, tab bar, panel skeletons,
                     styles; @@NAME@@ placeholders for built content
build_page.py        the single build (§6); writes dist/
theory.md            the breakdown and panel text source (Markdown
                     with $...$ and $$...$$ mathematics)
python/
  balance.py         the balance model (§4)
  runner.py          the canonical cell runner (references/runner.py
                     in this skill; copy unchanged)
  walkthrough.py     CELLS: the Code panel walkthrough (§7)
  test_balance.py    closure tests against the design basis
notebook/
  walkthrough_molab.py   generated, committed; the MoLab file
  walkthrough_wasm.py    generated WASM variant (build artefact)
make_molab.py        generates both notebook variants from CELLS
dist/                built pages under versioned filenames
shots/               browser verification screenshots (§8)
```

The sheet SVG, the dossier, and any sheet render scripts live with
the drawing project, not in the page directory; the builder reads
the sheet from a configured path and fails if it is absent.
Canonical texts bundled with this skill, under its `references/`
folder: `references/runner.py` (the cell runner, copied into each
project unchanged), `references/make_molab_core.py` (the core of the
notebook generator of §7), and starting skeletons under
`references/skeleton/` (`template.html`, `build_page.py`,
`theory.md`, `balance.py`, `walkthrough.py`) — schematic starting
points that mark their elided steps and write the mandatory checks
of §6 out in full.

## 4. The balance model

One Python module (`python/balance.py`) implements the process
calculation. Requirements:

- **Design-basis anchor.** A module-level record of the design basis
  (stream values as displayed on the sheet). The model's default
  evaluation reproduces it; `test_balance.py` asserts the overall
  closure and the principal derived quantities of the design basis
  exactly (to the displayed precision), so the page can never drift
  from the sheet it displays.
- **Relations of the specific process.** The model implements the
  overall balance and the internal relations that the breakdown text
  derives — no more. Forms in the reference set: a synthesis-loop
  model (fresh feed rate, recycle ratio defined as recycle mass flow
  rate divided by fresh feed mass flow rate, circulation ratio,
  formation per pass, purge rate from the loop balance) for ammonia
  and for methanol; a product-slate and furnace-duty model for crude
  distillation; a component-split model for air separation. Every
  symbol in the model is defined in the breakdown text before first
  use, with SI units, and the model code uses the same names.
- **Inputs and range.** A small set of reader inputs (typically two
  to four: a feed rate, a conversion or a split fraction, a ratio),
  each with stated units, a stated range, and validation that returns
  a plain-language error for out-of-range or malformed values — never
  a traceback in the page. The whole input range is swept before
  delivery (extremes and regime crossovers included).
- **Execution.** The same module runs at build time (for the
  precomputed run of §2) and live in the browser through the runner
  and a Pyodide worker. Live runs longer than a few seconds show a
  progress indicator. Results replace the precomputed display only
  on an explicit Run action; the displayed-parameters record drives
  the stale note of §2.

## 5. The breakdown panel and sub-process diagrams

The breakdown panel (Theory in the three-panel form, Process in the
seven-panel form) presents the main process in diagram order:

- One headed section per subunit or subunit group, in the order the
  subunits appear on the sheet. Each section states the subunit's
  duty, its operating conditions, its reactions and catalysts where
  applicable, and the quantities the model uses, each defined at
  first use.
- **Each section carries its own sub-process flow diagram** — a
  diagram of that sub-process alone, not a repeat of the full sheet.
  Construction: re-embed the full-sheet SVG with a cropped `viewBox`
  window on the sub-process region, wrapped in a figure whose
  caption belongs to a per-panel lettered series ("Fig. T1 | …" in a
  Theory panel, "Fig. P1 | …" in a Process panel), so the App panel's
  figure numbering is untouched.
- Crop windows are taken first from the crop windows recorded in the
  sheet's render script for its quality-assurance crops, then
  adjusted against the sheet's own geometry: check the anchor
  (start, middle, or end) and extent of every label near a window
  edge in the sheet SVG before fixing the window — start-anchored
  labels extend rightward from their anchor point and are the usual
  cause of clipped text at a right edge. A window is final only when
  the named equipment of the section is inside it, labels are legible
  at panel width, and no equipment is cut in half at an edge without
  the caption naming the boundary streams (the streams that cross
  the window edge). Captions name boundary streams and neighbouring
  sections by their figure numbers where a unit sits at an edge.
- After the subunit sections, the panel continues with the remaining
  Theory sections of §2 (production scale, economics, safety, issues
  of special concern) in the three-panel form.
- Text source: `theory.md`, Markdown with mathematics in `$...$`
  (inline) and `$$...$$` (display) spans, converted by the build (§6).
  Currency amounts in prose are written so the mathematics extractor
  cannot mistake them (§6); where a currency span is unavoidable, it
  contains no TeX command, no underscore, no caret, and no equals
  sign.

## 6. Build pipeline

One builder (`build_page.py`) produces the deliverable page in a
single run from the sources of §3. Rules, all mandatory:

- **Single source.** Listings, walkthrough, notebook variants, and
  page content are generated from the files of §3 at build time,
  never hand-copied into the template. Byte-identity checks in the
  build assert that the Code panel listings equal the files on disk
  and that generated variants equal their sources after the declared
  transformations.
- **Placeholders fail loudly.** Template placeholders have the form
  `@@NAME@@`; the substitution pattern matches the full name alphabet
  in use (`[A-Z0-9_]`), and the build fails on any placeholder left
  unfilled, any content with no placeholder, and any missing input
  file. No silent no-ops.
- **Mathematics.** Markdown is converted with markdown-it-py
  (CommonMark, tables enabled). Mathematics spans are protected
  before Markdown conversion and rendered with KaTeX at build time
  in one batched call (server-side rendering; the delivered page
  needs no mathematics JavaScript at open time beyond the inlined
  KaTeX assets). The extractor rule, learned from a shipped defect
  (§11): a `$...$` span is mathematics when it contains a TeX command
  (a backslash), an underscore, a caret, or an equals sign,
  regardless of spaces or a leading digit; a currency guard may leave
  a span literal only when none of those markers is present. The
  build fails when any rendered panel still contains a literal
  `$...$` span holding a TeX command, or when the count of rendered
  KaTeX elements differs from the count of extracted formulas.
- **Citations.** Two layers, both mandatory: mechanical (every
  in-text citation key resolves to exactly one bibliography entry,
  every entry is cited, no orphans — asserted in the build) and
  factual (authors, year, title, and publication record checked
  against the publisher or Crossref record). Entries inherited from
  the dossier are not exempt.
- **Boot integrity.** Every Python module shipped to the browser is
  registered in three places: the builder's Pyodide file-system
  write list, the notebook generator's module registration, and the
  Code panel listing; a module missing from any one is a build
  failure. Heavy optional imports are lazy (function-level), so a
  load failure breaks only the labelled feature that needs them.
  Python embedded in JavaScript strings contains no backslash escape
  sequences (special characters are built with `chr()`), and the
  build runs a boot compile guard: the embedded Python is extracted
  from the finished page, passed through each JavaScript string
  layer's escape processing in order, parsed with the Python parser,
  and executed under CPython against a representative message set
  (including every session-dependent message with no live session,
  asserting plain-language guard errors). The guard is trusted only
  after it has been shown to reject a known-broken page.
- **Dependencies.** Every package not bundled with the runtime is
  declared in the PEP 723 script header (`# /// script`) of every
  notebook variant; imports of undeclared packages are build
  failures. Notebook variants also carry an in-notebook installer
  cell where the hosting environment requires one.
- **Self-containment.** A page delivered as a file (for example in a
  chat) inlines its JavaScript, styles, and fonts and renders its
  mathematics at build time, with an explicit page background and a
  light colour scheme declared, so it opens identically offline. A
  page published to a web host may reference the host's asset paths
  where the host serves them with the page.
- **Versioned output.** The builder writes
  `dist/<process>-v<n>.html`, where `<process>` is the process slug
  (for example `ammonia-synthesis-plant`) and `<n>` is the version,
  incremented on every content change. Changed content is never
  re-delivered under a previous filename.

## 7. Code panel and notebook pair

- **Code panel.** A dedicated panel holding the complete
  computational code (the model, the runner, the walkthrough source;
  not interface chrome), rendered from the files on disk at build time
  so the listing cannot drift from the executed code, with its own
  table of contents (§2) and a walkthrough sub-tab. Listings carry
  comments giving the physical meaning of each block and the shape of
  each array operation; every symbol is defined before first use.
- **Walkthrough.** The walkthrough is a marimo notebook broken into
  cells, one transformation per cell, each cell ending in a displayed
  intermediate, with plain value assignments as inputs (no widgets:
  the reader edits a value and re-runs). It is rendered into the Code
  panel as a static sub-tab, computed at build time; its wording
  states that the results were computed when the page was built,
  never that they are computed live. An anchor cell asserts
  hand-verified design-basis values and fails loudly on drift.
- **Notebook pair, labelled by role.** Two links, each labelled by
  role so the reader chooses correctly: the pre-run read-only WASM
  walkthrough page (instant results, no sign-in, code visible but
  not editable), and the editable notebook on the MoLab link (the
  notebook hosting service at molab.marimo.io; the link is given on
  its own labelled line in every handover that reports the page
  ready). The MoLab file is a committed, self-contained variant: the
  model source is inlined into it at build time by `make_molab.py`
  (the mirror serves a single file with no repository checkout, so it
  must not import project-local modules), byte-identity of the inlined
  source against its origin is asserted, and namespace bindings the
  cells expect are derived from the module's own syntax tree inside
  the generator, never maintained by hand.
- **Verification of the variants.** The battery of §8 runs on the
  generated variant files themselves (the WASM variant notebook is
  executed with a real kernel, not only the source notebook), because
  inlining defects are invisible in the source variant.

## 8. Verification battery

No page is delivered, published, or reported ready on build-log
evidence alone. In order:

1. **Unit tests.** The model tests pass (design-basis closure,
   §4), including a whole-range input sweep.
2. **Build checks.** The assertions of §6 pass: placeholders,
   mathematics extraction and KaTeX count, citation mechanical
   check, listing byte-identity, boot compile guard with its
   no-session and invalid-input sweeps.
3. **Browser check of the built page (no exceptions).** The built
   page is served locally and opened in a real browser (Playwright
   with headless Chromium in the reference environment). Screenshots
   are inspected, not merely captured, at desktop width and at a
   390 px phone width, covering: every panel; every figure, including
   every sub-process diagram crop (§5); the mathematics as rendered
   (inspected for raw dollar signs, TeX command fragments, and
   mangled subscripts in visible text); the model run end to end
   (boot completes with no console errors, Run recomputes, the stale
   note appears and clears); fragment navigation to a mid-panel
   section. Specific assertions: the sticky tab bar's bounding-box
   top is 0 (within 1 px) after scrolling at least 1,000 px, at both
   widths, and clicking a different tab while scrolled switches the
   panel; the document scroll width equals the viewport width at
   390 px with the App panel's charts rendered (the chart refit of
   §2 applied); header and body share left and right edges at a
   2,560 px viewport width. Screenshots are kept in `shots/`.
4. **Published-page check.** After publication (§9), the served
   bytes are compared with the build output by byte comparison (an
   HTTP 200 response alone is not verification), the publication run
   is confirmed to have started (re-triggered when it has not), and
   the published page is checked in the browser as in step 3. Where
   the checking environment cannot reach the public internet, the
   browser check is run on the byte-identical local build and the
   handover states this.
5. **Failure handling.** A check that fails returns the page to the
   relevant build step; the corrected page is issued under a new
   version (§6) and the full battery re-runs. A result that looks
   wrong is reproduced with the reference code and quantified before
   it is classified as real behaviour, display artefact, or defect.

## 9. Publication

- **Repository layout.** One top-level directory per process on the
  repository's main branch, holding the page sources of §3; built
  deliverables are never committed on the main branch. Built pages
  publish to the Pages branch (GitHub Pages in the reference set)
  under a `muse-html/<process-slug>/` subfolder, alongside the
  walkthrough page and the MoLab notebook file, with a `.nojekyll`
  marker at the branch root.
- **Scoped pushes.** When several pages are in progress concurrently
  (in the reference set, three plants were built in parallel by
  separate conversations), a push is scoped to the publishing page's
  own paths, computed against the current remote head: a whole-tree
  push from a stale local tree deletes files the other work has
  added. Pull before pushing, review the comparison, never
  force-push, and byte-verify every pushed blob against the local
  `git hash-object` after the push.
- **Coordination.** Corrections that apply to pages in progress in
  other conversations are sent to those conversations as explicit
  instructions (the rule, the exact change, and the verification),
  and each page's owner republishes its own page; a page is not
  silently overwritten from outside its own build.
- **Links in the handover.** The published page URL on its own
  labelled line, and the MoLab link on its own labelled line,
  whenever a page or notebook is reported ready. A rebuild or
  republication is never reported without its link.

## 10. Handover

Deliver, in the handover message: the built page (attached, or at
its published URL on its own labelled line); the MoLab link on its
own labelled line; the design-basis anchors the model reproduces;
the measured verification results of §8 (which browser checks ran,
at which widths, and their outcomes); whether the stream values are
a supplied process result or labelled sample values; the defaults
used for any unanswered design question of §1; and anything not
verified, labelled as an expectation. Engineering caveats belong in
the handover, not inside the page; the page presents the intended
path as the path.

## 11. Incident register

Defects that shipped or nearly shipped in the reference set, each
with its standing remedy, now in the sections cited.

- **Unrendered inline mathematics** (ammonia page, version 2,
  2026-10-24). A currency guard in the mathematics extractor left
  every `$...$` span containing a space as literal text; Markdown
  then rendered the subscripts as emphasis, and a paragraph of loop
  definitions reached readers as raw text. Remedy: the extractor
  rule, the build-time failure on a literal TeX span, and the
  rendered-mathematics inspection of §6 and §8. A strict KaTeX render
  pass alone does not catch spans the extractor never sent to it.
- **Plotly default sizing** (air separation page, 2026-10-24). The
  charts were measured before the flex layout settled and fell back
  to a 700 px default width, giving a document scroll width of
  716 px at a 390 px viewport — invisible on every text panel and
  caught only by the App panel phone check. Remedy: the chart refit
  of §2 and the scroll-width assertion on the App panel in §8. The
  same page's results column also shrink-wrapped to the width of its
  metric cards in the phone layout; the column is given full width
  in the phone media query.
- **Cropped-diagram label clipping** (all three plant pages,
  2026-10-24). First crop windows, taken from the sheet render
  scripts, cut start-anchored labels and neighbouring equipment at
  window edges on most sub-process diagrams. Remedy: window
  adjustment against the sheet's label anchors and extents, and the
  caption boundary rule of §5; every crop is screenshot-inspected
  before publication.
- **Concurrent-build overwrite risk** (2026-10-24). Two conversations
  publishing to one repository; a whole-tree push tool computed
  deletions for paths absent from the stale local tree. Remedy: the
  scoped, head-based push of §9.
- **Unguarded worker session state** (a related worker-backed page,
  2026-10-20; applies to any page whose worker holds session state).
  A precomputed display was mistaken for a live session; every
  session-dependent action then failed and the page printed a raw
  traceback. Remedy: the worker handler guards every state-dependent
  message with a plain-language error; session-dependent controls
  stay disabled until a live session exists; precomputed displays
  are labelled precomputed; tracebacks go to the console only; the
  boot guard battery of §6 exercises every message type with no
  session and invalid inputs against a live session.
- **Template-literal escape collapse** (a related page, 2026-10-20).
  Python embedded in nested JavaScript template literals lost a
  level of backslash escaping per layer and reached the browser
  runtime as a syntax error, while every check that bypassed the
  JavaScript layers passed. Remedy: no backslash escapes in embedded
  Python, and the boot compile guard of §6.

## 12. References

- PFD-SPEC-001, "Layout of Process Flow Diagrams" — the governing
  specification of the companion process flow diagram drawing skill
  (sheet construction, symbol catalogue, balance rule, verification).
- ISO 10628-1:2014 and ISO 10628-2:2012, Diagrams for the chemical
  and petrochemical industry, Parts 1 and 2.
- ANSI/ISA-5.1-2009, Instrumentation Symbols and Identification.
- The STEM visual style specification governing figures, captions,
  and legends on the page (the host project's design guidelines;
  a target journal's guidelines override it, and the reader's
  explicit instructions override both).
