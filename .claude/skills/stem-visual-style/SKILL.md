---
name: stem-visual-style
description: Visual style specification for journal-grade STEM figures, diagrams, plots, documents and HTML pages (sizes, typefaces, line weights, colour, export, captions, page layout). Load before drawing or styling any figure, plot, schematic or page.
---

# STEM visual style: journal-grade, not AI-generated

This skill applies to every figure, diagram, plot, document, Markdown file and HTML page I produce for technical or STEM content.

Precedence:

The target journal's current author guidelines override the defaults here. Specs change, so verify them before any submission.
Explicit user instructions override both.
The core principle is that every visual choice encodes information. If an element carries no meaning, remove it.

0. Before drawing or writing anything
State the message. Write the one-sentence message. If there are two messages, use two figures or two panels.
Fix the final size and medium first: journal column, slide, or web page. Design at that size; never design large and shrink.
Plan the reading order. Decide what the eye should hit first, second and third, and sketch the layout.
Verify the science before polishing:
physics, chemistry, units and conservation;
plausible proportions.
1. Banned: the AI tells
Decoration

Emoji, icons in headings, and an icon on every card or list item.
Gradients, glows, glassmorphism, gradient text, drop shadows and neon accents.
Purple-to-blue "tech" palettes, rainbow or jet colormaps, and saturated primaries everywhere.
Layout

Three-card feature grids, centered hero sections, pill badges and floating rounded cards.
3D charts, and perspective or isometric drawings that add no information.
Text

Bold scattered through paragraphs, everything turned into bullets, and "Key takeaways" or "In conclusion" boxes.
Filler prose: "Let's dive in", "It's important to note", reflexive groups of three, and chained em-dashes.
Figure furniture

Vertical or angled text where it can be avoided.
Chart titles that duplicate the caption.
Boxed legends where direct labels would fit.
The figure number or title inside the figure file; it belongs in the caption.
2. Figure defaults, measured at final printed size
Width

Single column: about 85–89 mm (3.3–3.5 in).
1.5 column: about 114–140 mm.
Full width: about 170–183 mm.
Maximum height: about 225 mm including the caption.
Typeface

Use one sans-serif (Arial or Helvetica) across all figures.
Exception: journals that use a serif house style, such as The Lancet.
Text size

Labels: 7 pt, within a range of 6–9 pt.
Sub- and superscripts: at least 6 pt.
The same sizes across every figure.
Graphical abstracts: 12–16 pt.
Panel labels

8 pt bold.
Lowercase a, b, c in Nature style, or uppercase A, B, C per the journal.
Line weights

Primary objects: 1.0 pt.
Axes and secondary objects: 0.5 pt.
Leaders, dimension lines and hairlines: 0.25–0.35 pt.
Data lines: 1–1.5 pt.
Never thinner than 0.25 pt.
Markers

3–5 pt, always larger than the line width.
Use open versus filled as a second channel.
Arrows

One arrowhead shape at a constant size.
Distinct styles by meaning: flow, force, heat and annotation.
Explain the convention once.
Leader lines

Match the weight of the label text.
Labels left of the art are flush right; labels right of the art are flush left.
Leaders never cross.
Color

Grays for structure, plus one accent color; at most about four semantic hues.
Categorical data: the Okabe–Ito palette.
Sequential data: viridis or cividis.
Diverging data: a diverging map centered on a meaningful zero.
Each color keeps the same meaning across all figures.
Accessibility

Always pair color with a second channel: marker shape, dash pattern or a direct label.
No red/green pairs; use blue/orange or green/magenta instead.
The figure must still read in grayscale.
Export

Line art and text as vector (PDF, EPS or SVG), with fonts embedded (TrueType, type 42) or converted to outlines.
Photographs and other raster images at 300 dpi or more at final size.
Combination art at 500–600 dpi or more; raster line art at 1000 dpi or more.
RGB for digital journals.
3. Schematics and illustrations
Style

Flat 2D, orthographic views.
Shading only where it carries meaning: light gray for solids, a pale tint for fluids.
Standard conventions: hatching for walls and solids, ISA-5.1 symbols for P&IDs, and standard unit-operation symbols.
Physical correctness checklist

The laminar pipe profile is parabolic; the turbulent profile is blunt.
Boundary layers grow downstream.
Streamlines never cross.
Inlet and outlet flows balance.
Gravity direction is shown when it matters.
Coordinate axes are shown with an origin.
Dimensions or a scale bar are included.
Notation

Symbols in figures match the text exactly.
Variables in italic; units and descriptive subscripts upright (u_max with "max" upright).
Vectors in bold.
Layout

Align everything to a grid, with equal gutters between panels.
Related panels are the same size.
Keep whitespace generous and use one visual hierarchy.
4. Data plots
Axes

Labels read "Quantity, symbol (unit)", for example "Pressure drop, Δp (kPa)".
Few, round-number ticks, pointing outward.
No top or right spines unless that is the field's convention.
No heavy gridlines and no chart title; the caption carries the message.
Showing the data

Prefer points over bars, and show individual data where feasible.
State n and what the error bars are (SD, SE or CI) in the caption.
Experimental data as markers, models and fits as lines. Label a fit with its equation if it is short.
Chart choices

Use log scales only deliberately, with decades labelled as powers (10^2).
No pie charts; use a dot plot or stacked bar instead.
For many conditions, use small multiples with shared axes rather than one overloaded plot.
5. Captions
Format: "Fig. N | Takeaway sentence."
Then cover, in order: what is shown, symbol definitions, conditions, n, and the error-bar definition.
The figure plus its caption must be understandable without the main text.
6. Documents and Markdown
Structure

Prose by default. Use bullets only for genuinely parallel items, and tables only for real comparisons across shared attributes.
Headings in sentence case that state the content, for example "Pressure drop scales with u²" rather than "Analysis".
At most three heading levels.
Page layout

Line length of 45–75 characters, line height of 1.4–1.5, and one body typeface.
Typography

En dash for ranges (10–20 m), a true minus sign (−3) and the × sign.
A non-breaking thin space between number and unit (5 m/s).
SI usage per ISO 80000 and NIST SP 811.
Consistent significant figures.
Equations

Number equations and reference them in the text.
Define every symbol on first use, and add a nomenclature table when there are more than about 10 symbols.
Markdown specifics

LaTeX math ($...$ and $$...$$).
No emoji.
Bold only for a defined term or a genuine warning.
Writing

Plain, specific and quantitative.
No hype, no throat-clearing, no summary of what was just said.
7. HTML pages
Layout

Text column max-width of 65–75ch, left-aligned. Figures may break out wider.
Separate content with whitespace and 1 px hairline rules, not shadows or cards. Border radius 4 px or less, if any.
Type and spacing

A type scale with a 1.2–1.25 ratio, and spacing on a 4/8 px grid.
Colors as tokens on :root, with dark-mode variants.
A system font stack or one deliberate pair, such as a serif body with sans-serif figures.
font-variant-numeric: tabular-nums for numbers in tables.
Figures and math

Math rendered with KaTeX or MathJax.
Figures as inline SVG using the same tokens as the text, captioned with <figure> and <figcaption>.
Motion and interaction

No decorative animation.
Interactivity only when it reveals something, such as a slider for Re that redraws a velocity profile.
Reference look: a well-typeset textbook page or a Distill.pub article, never a SaaS landing page.

8. Starter snippets
Matplotlib:

```python

import matplotlib as mpl, matplotlib.pyplot as plt
MM = 1/25.4
mpl.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 7, "axes.labelsize": 7,
    "xtick.labelsize": 6.5, "ytick.labelsize": 6.5, "legend.fontsize": 6.5,
    "axes.linewidth": 0.5, "xtick.major.width": 0.5, "ytick.major.width": 0.5,
    "xtick.major.size": 2.5, "ytick.major.size": 2.5,
    "xtick.direction": "out", "ytick.direction": "out",
    "axes.spines.top": False, "axes.spines.right": False,
    "lines.linewidth": 1.0, "lines.markersize": 3.5,
    "legend.frameon": False,
    "axes.prop_cycle": mpl.cycler(color=[
        "#0072B2", "#D55E00", "#009E73", "#CC79A7",
        "#E69F00", "#56B4E9", "#F0E442", "#000000"]),  # Okabe-Ito
    "pdf.fonttype": 42, "ps.fonttype": 42, "svg.fonttype": "none",
    "savefig.dpi": 600, "savefig.bbox": "tight", "savefig.pad_inches": 0.02,
})
fig, ax = plt.subplots(figsize=(89*MM, 62*MM))  # single column
CSS tokens:

```css

:root {
  --ink: #1b1b1b; --ink-2: #5a5a5a; --rule: #d6d6d6;
  --paper: #ffffff; --tint: #f4f6f8; --accent: #0072B2;
  --measure: 68ch; --s1: 4px; --s2: 8px; --s3: 16px; --s4: 24px; --s5: 40px;
}
body { background: var(--paper); color: var(--ink);
  font: 17px/1.5 Georgia, "Source Serif 4", serif; }
main { max-width: var(--measure); margin: 0 auto; padding: 0 16px; }
h1, h2, h3 { font-weight: 600; line-height: 1.2; }
hr, table { border-color: var(--rule); }
figcaption { font: 14px/1.4 system-ui, sans-serif; color: var(--ink-2); }
9. Final check, run every time
[ ] One message per figure, and the caption states it.
[ ] Text is 6–9 pt at final size, in one typeface, consistent across figures.
[ ] Strokes come from the line-weight hierarchy, and nothing is thinner than 0.25 pt.
[ ] Color is semantic, with at most one accent; it is colorblind-safe, double-encoded and readable in grayscale.
[ ] Labels are direct; there is no boxed legend unless it is unavoidable.
[ ] Units, italics and symbols match the text; SI formatting is correct.
[ ] The science is correct: profiles, conservation, directions, scale.
[ ] Export is vector with fonts embedded, and rasters meet the dpi requirements.
[ ] Nothing from the banned list remains.
[ ] A remove-10% pass is done: any element whose removal loses no information has been cut.
[ ] If submitting, the target journal's current author guidelines have been checked and override these defaults.

---

## Adoption notes (2026-10-16)

Decisions recorded when this spec was merged into the standing guidelines;
the spec above is the user's verbatim text and takes precedence over these notes.

- Precedence: the target journal's current author guidelines override this
  spec; the user's explicit instructions override both. (From the spec itself.)
- Axis labels: the spec's "Quantity, symbol (unit)" format applies to
  journal-bound figures. For interactive figures where the caption sits
  adjacent (Streamlit, marimo, web), the succinct "symbol (unit)" form is
  kept, with symbols defined in the caption or surrounding prose.
- In-figure titles: not used. The title lives in the surrounding heading
  and the caption; it never duplicates inside the figure.
- Print sizes (85–89 mm columns, 7 pt labels, pt line weights) apply to
  journal submissions; screen work uses proportional equivalents.
- Gridlines: thin light gridlines are kept for interactive web figures
  (they aid value readout); journal-submission figures use none.
- HTML delivery: self-contained single files with third-party JS inlined
  (CDN script tags have rendered blank in the client's file viewer);
  explicit background and color-scheme so the page never inherits the
  viewer's theme.
- The examples gallery (a local HTML file, not included in this package)
  is the living demonstration of this spec for Plotly figures.

## Appended from AGENTS.md (2026-10-29 compaction)

Entries moved verbatim from AGENTS.md during the 2026-10-29 compaction; AGENTS.md carries a one-line index entry for each.

### From AGENTS.md C18

- plotly log axes: pin the y-axis range explicitly from finite positive data (±0.2 decades); autorange once rendered a curve invisible with the axis blown out to 1e207.

### From AGENTS.md L32

- Quiver arrow aesthetics (stated 2026-10-17, standing rule): always screenshot-inspect quiver/vector-field arrows at final size — they must be clearly visible (never tiny dots) and must not overlap. Tune the length cap, shaft width, and head size per figure and re-verify on the render.

### From AGENTS.md L33

- Colormap and contrast checks (stated 2026-10-17, standing rule): when choosing colors for a figure, check the STEM visual style spec first (sequential: viridis or cividis; categorical: Okabe–Ito; no red/green pairs; grayscale-readable; color always double-encoded) AND verify contrast against the actual background the marks sit on — a spec-compliant palette can still fail on a tinted fill (viridis yellow on the pale-blue annulus was nearly invisible until every arrow got a thin dark-navy edge).

### From AGENTS.md L34

- Quiver + colorbar share one normalization (2026-10-17): `ax.quiver` autoscales its colors to the arrow data range `[min|v|, vmax]`; a colorbar pinned at `[0, vmax]` then disagrees with the arrows (darkest arrow wears the color the bar labels 0). Pass one shared `plt.Normalize(0, vmax)` to both the quiver call and the colorbar's ScalarMappable.
