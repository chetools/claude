### The trap
NPSH available falls fast as a liquid approaches its boiling point: the vapour pressure term grows and the density
falls. Using cold-water properties for hot condensate, or the normal level instead of the lowest level, gives an
NPSHa that the pump never sees.

### What I would likely do
I normally include vapour pressure. I may take it from memory rather than from a steam table, use the
normal operating liquid level, and leave out the NPSH margin over NPSHr that pump vendors and company standards
require.

### Where my uncertainty sits
- **Vapour pressure from memory.** Usually within a few percent for water, worse for mixtures and for
  hydrocarbons near their bubble point.
- **Which liquid level.** Low-low level or bottom tangent line is the design case; I tend to use what is given.
- **Liquid at its bubble point in a drum.** Then the surface pressure equals the vapour pressure and only static head
  minus losses is left; I may still add a pressure term.
- **Margins and NPSHr definition.** NPSHr is at 3 % head drop; the required margin is a company/vendor rule I don't know.

### What an experienced engineer catches
- Hot condensate pumps with a small static head are known trouble; they look for the elevation first.
- Suction strainer pressure drop when it is fouled, not clean.
- Reciprocating pumps need acceleration head; dissolved gas lowers the effective NPSHa.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I use the wrong temperature basis for vapour pressure | 5–15 % |
| Chance I omit the NPSH margin and the low-level case | 30–50 % |
| Error in a vapour pressure I recall without computing (water) | ± 1–5 % |
| Error in a vapour pressure I recall for a hydrocarbon mixture | ± 10–30 % |

### Prompt that helps
```
Compute NPSHa at the LOW-LOW liquid level (give elevations), at the maximum pumping temperature, with a fouled
strainer. Compute vapour pressure and density from a stated correlation (IAPWS-IF97 or a cited Antoine set),
not from memory. Compare with NPSHr at 3 % head drop and state the margin rule you apply.
```
