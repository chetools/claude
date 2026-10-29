## 1. Why these errors happen

I produce the most plausible continuation of what you wrote. That makes me good at textbook procedure and weak at
three things a plant engineer brings without thinking about it:

- **Conventions the prompt leaves open.** Gauge or absolute, Darcy or Fanning, normal or standard conditions,
  mass or mole basis. I pick one silently, and the answer still looks complete.
- **Data I recall instead of compute.** Vapour pressures, latent heats, binary parameters, typical U values and K
  factors come from memory unless I am told to compute them or am given them. Recalled numbers are usually close,
  sometimes not, and I cannot tell which from the inside.
- **The context outside the question.** The governing relief scenario, the lowest liquid level, the fouled
  condition, the start-up case, the company standard. I don't see the plant, and I don't know what I wasn't told.

My tone does not track my accuracy: a wrong answer reads as confidently as a right one. The cases on the App tab
show where that matters.

## 2. How to prompt so that errors are less likely

### 2.1 State the basis explicitly
Give every pressure as gauge or absolute, every flow as mass or volume (and at which conditions), compositions as
mole or mass fraction, and say which design case you want (normal, maximum, minimum, start-up, fouled).

```
Basis: pressures in barg unless marked "a"; site atmospheric 1.005 bar. Flows in kg/h.
Design case: maximum throughput, fouled exchangers, low-low liquid levels.
```

### 2.2 Ask me to list assumptions before calculating
A list of assumptions is the cheapest place to catch a wrong convention.

```
Before any calculation, list every assumption and every value you will take from memory rather than
from my data. Number them. Then stop and wait for me to confirm or correct them.
```

### 2.3 Ask for regime and validity checks
Most of the ten cases are a regime change the naive formula ignores: choked flow, temperature cross,
near-critical state, azeotrope, flashing.

```
For each equation you use, state its validity range and check that this case is inside it.
Explicitly check for: choked or critical flow, flashing or cavitation, two-phase flow, temperature cross,
proximity to a critical point or azeotrope, laminar/transition flow.
```

### 2.4 Make me compute properties, not recall them
```
Do not quote physical properties from memory. Compute them with a named method (IAPWS-IF97,
CoolProp/REFPROP EOS, NIST Antoine constants with their range) or ask me for them. Mark any value you
still had to recall with [recalled].
```

### 2.5 Ask for a second, independent method
Two methods that agree are much stronger evidence than one method stated confidently.

```
Check the result with an independent method (e.g. ε-NTU vs LMTD-F, Swamee-Jain vs Colebrook,
a rule-of-thumb range for this service) and report both numbers and their difference.
```

### 2.6 Ask for code, and run it
Arithmetic done in prose is where I slip on unit conversions. Code that runs (Python here) removes most of the
numerical error and makes the setup inspectable.

```
Write the calculation as a short Python script with units in every variable name, run it, and show the output.
```

## 3. Prompts for the unknown unknowns

You cannot prompt for an error you don't know about, but you can make me search for them in the places they usually
come from: missing scenarios, wrong conventions, extrapolated data, and the plant outside the question.

### 3.1 Red-team the answer as a plant engineer
```
Now review your own answer as a senior process engineer with 25 years of operating-plant experience
who distrusts it. What would they object to first? List the five most likely errors, with how each
would change the result (direction and rough size).
```

### 3.2 Ask what I didn't ask you
```
What information did you NOT have that a plant engineer would insist on before trusting this result?
For each item, say what you assumed instead and how the answer changes if that assumption is wrong.
```

### 3.3 Sensitivity: which input moves the answer most
```
Rank the inputs and recalled values by how much a plausible error in each changes the result.
Give the ±% change for each. Which one would you verify first?
```

### 3.4 Scenario and failure-mode sweep (HAZOP style)
```
Apply HAZOP guide words (more/less/none/reverse/other than) to flow, pressure, temperature, level and
composition for this equipment. Which deviations would invalidate this design calculation?
```

### 3.5 Confidence by component, not overall
```
Split your answer into: (a) setup and assumptions, (b) property data, (c) arithmetic, (d) applicability
to a real plant. Give a separate confidence for each and say what would raise it.
```

### 3.6 Compare against known plant numbers
```
Compare the result with typical values for this service in operating plants (velocity, dP per 100 m,
approach temperature, U, specific energy). If it falls outside the usual range, explain why or say it is likely wrong.
```

## 4. When the stakes are high

For anything involving relief systems, reactive chemistry, toxic or flammable inventories, or pressure equipment:

- Use me to draft, check and explain, not to sign off. Every result needs review by a qualified engineer against the
  applicable codes and company standards.
- Give me your data instead of letting me recall it, and ask for the calculation as runnable code.
- Run sections 3.1–3.3 above on every result, and compare with an independent tool (your simulator, vendor sizing
  software, or a hand calculation by someone else).

## 5. Self-estimated uncertainty for the ten cases

These are my own **subjective** estimates of how often I would get each case wrong. They are not measured error rates
and have not been checked against any benchmark. The App tab shows the numerical size of each mistake for the
inputs you choose.

| Case | Wrong setup, prompt silent on the trap | With the suggested prompt | Data I would recall |
|---|---|---|---|
| 1. Gauge vs absolute pressure | 20–35 % | < 3 % | k: small error for common gases |
| 2. Pipe pressure drop | 30–50 % (fittings), 10–20 % (Darcy/Fanning) | < 5 % | fitting K: ± 30–50 % |
| 3. NPSH for a hot liquid | 30–50 % (margin, low level) | < 5 % | vapour pressure: ± 1–5 % (water) |
| 4. Choked / flashing control valve | 30–50 % | < 5 % | $F_L$: ± 10–25 % on choked ΔP |
| 5. Non-ideal VLE | 15–30 % | ~ 5 % | binary parameters: ± 10–30 % in $\gamma^\infty$ |
| 6. Dense-phase CO2 | 30–50 % (no EOS error warning) | < 5 % | density from memory: ± 5–20 % |
| 7. Exchanger F factor | 25–40 % | < 5 % | U: ± 30–60 % |
| 8. Fire-case relief | 30–50 % (properties); scenario: not estimable | ~ 15 % | latent heat: ± 10–30 % |
| 9. Semi-batch scale-up | 20–35 % | ~ 5 % | U: ± 30–50 % |
| 10. Flash steam | 25–40 % | < 5 % | steam enthalpies: ± 3–10 % of the flash fraction |
