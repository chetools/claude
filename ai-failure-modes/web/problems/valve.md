### The trap
For a hot liquid, the flow through a control valve stops rising with pressure drop once the vena contracta reaches
vapour pressure: the flow is **choked**. Sizing with the full pressure drop gives a valve that is too small. When the
outlet pressure is below vapour pressure the liquid **flashes**, which needs different trim and body material.

### What I would likely do
Asked for "the Cv", I may apply $C_v = Q\sqrt{SG/\Delta P}$ with the full $\Delta P$ and stop there, especially in a
quick answer. I know the IEC 60534 choked-flow equation, but I do not reliably check it unprompted.

### Where my uncertainty sits
- **Whether I run the choked check at all** when the question doesn't hint at it.
- **The value of $F_L$** (pressure recovery factor). It depends on valve style, size and opening; I use typical
  numbers, and the choked $\Delta P$ scales with $F_L^2$.
- **Flashing vs cavitation.** Getting the label wrong changes the trim choice and the erosion risk.
- **Downstream effects** (outlet velocity, noise, two-phase line sizing) that I tend not to cover.

### What an experienced engineer catches
- "That's boiler feed / hot condensate — check for flashing."
- Valve outlet sized for liquid when it carries flashed vapour.
- Cavitation damage starts well below the choked pressure drop; the incipient-cavitation factor $x_{Fz}$ is
  valve-specific.
- Valve opening at min/normal/max flow; a valve sized only at normal flow may not control at the extremes.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I skip the choked / flashing check in a quick answer | 30–50 % |
| Same, when the prompt asks for an IEC 60534 check | < 5 % |
| Effect of my generic $F_L$ on the choked pressure drop (choose the valve type) | ± 10–25 % |
| Kv arithmetic once set up (code) | < 0.5 % |

### Prompt that helps
```
Size this valve to IEC 60534-2-1. Show the choked-flow check (F_F, F_L, ΔP_choked), say whether the flow is
cavitating or flashing, and give Kv at minimum, normal and maximum flow with the resulting % opening for an
equal-percentage globe valve. State the F_L value you assume and how sensitive the result is to it.
```
