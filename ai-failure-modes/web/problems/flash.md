### The trap
Saturated condensate let down through a steam trap partly flashes to steam. The mass fraction is modest, but steam
at low pressure is so much less dense than water that the flash steam takes almost all the volume of the return
line. A line sized for liquid only ends up with high velocity, water hammer and back pressure on the traps.

### What I would likely do
Asked about "condensate return sizing", I may size for the liquid and add a remark about flash steam. Asked
directly about flash steam, I compute it, but I can mix up barg and bar a when the units are ambiguous.

### Where my uncertainty sits
- **Gauge or absolute pressure** in the steam and return pressures.
- **Steam properties from memory.** Enthalpies recalled without a steam table can be off by a few kJ/kg, which matters
  because the flash fraction is a small difference of two enthalpies.
- **Two-phase flow model.** The homogeneous model here gives a volume; real line sizing uses velocity limits and
  slip models that I would only quote in general terms.
- **Subcooling.** Traps that back up condensate let it subcool, which reduces flash.

### What an experienced engineer catches
- Back pressure in a shared return header limits trap capacity for low-pressure users.
- Flash vessels to recover the steam; vent sizing on open condensate tanks.
- Water hammer from mixing hot flashing condensate into a cold, partly filled line.

### Self-estimated uncertainty
| | Self-estimate |
|---|---|
| Chance I size the return line for liquid only, in a quick answer | 25–40 % |
| Chance I mix barg and bar a when units are ambiguous | 15–30 % |
| Error in flash fraction if I use recalled steam-table values | ± 3–10 % of the fraction |
| Flash fraction from IAPWS properties (code) | < 0.5 % |

### Prompt that helps
```
Pressures are barg; atmospheric is 1.013 bar. Use IAPWS-IF97 (state the tool). Compute the flash fraction and the
two-phase volumetric flow in the return line, and size the line for a mixture velocity limit I give you.
Comment on back pressure on the traps of the lowest-pressure users and on water hammer.
```
