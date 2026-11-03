# Examples [load at a revision or check pass, with ai-check.md]

Each pair shows a form a rule rejects and a form it accepts. The examples are constructed; they are not corpus quotations, and their numbers illustrate form only.

## One name per object (core rule 10)

- Rejected: "The Ergun equation gives the pressure drop across a packed bed. The correlation assumes a rigid bed, and the relation fails once the bed fluidizes."
- Accepted: "The Ergun equation gives the pressure drop across a packed bed and assumes a rigid bed. Once the bed fluidizes, the Ergun equation no longer applies."

## No inference marker in a frame sentence (core rule 14)

- Rejected: "The selectivity loss stays below 2 % up to 0.5 mol/L. The design concentration is therefore 0.5 mol/L."
- Accepted: "The selectivity loss stays below 2 % up to 0.5 mol/L, and 0.5 mol/L is the design concentration."

## Limit inside the claim sentence (core rule 25)

- Rejected: "The model predicts conversion within 3 %. This holds only below 400 K."
- Accepted: "Below 400 K, the model predicts conversion within 3 % of the measured value."

## Number bundled with its baseline (core rule 26)

- Rejected: "The surrogate reduced the error by 40 %."
- Accepted: "The surrogate reduced the mean absolute error in outlet temperature by 40 % against the linear baseline (2.1 K against 3.5 K, 120 test cases)."

## Validity and omission wording (core rule 32)

- Rejected: "The result holds for laminar flow."
- Accepted: "The Hagen–Poiseuille equation is valid for laminar flow; in turbulent flow the friction factor also depends on the relative roughness of the pipe wall."
- Rejected: "Radiation is not considered."
- Accepted: "Radiative heat transfer is neglected because the wall and gas temperatures differ by less than 20 K."

## House word list (`ai-check.md`)

- Rejected: "The equation does not carry a convection term."
- Accepted: "The equation has no convection term."
- Rejected: "Scope ends at the reactor outlet."
- Accepted: "The model is limited to the reactor; the separation train is not included in the model."
