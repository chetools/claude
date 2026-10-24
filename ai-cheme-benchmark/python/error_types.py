"""Error taxonomy for lost points (shared by the labelling check and documented on the Methodology tab)."""

TYPES = {
    "method": ("Wrong method or model",
               "an approach, equation structure or model that cannot give the answer (e.g. wrong governing equation, "
               "wrong solution procedure, made-up formula structure)"),
    "formula": ("Wrong formula or correlation",
                "the right approach but a wrong or misremembered formula, correlation, coefficient or constant"),
    "numerical": ("Numerical or arithmetic slip",
                  "sound method and formula, wrong number: arithmetic, rounding, transcription, a failed iteration"),
    "units": ("Unit or conversion error",
              "wrong or missing unit conversion, or a unit mismatch that changes the value"),
    "incomplete": ("Missing or incomplete",
                   "part not answered, reply cut off, no final value, or an answer without the required basis"),
    "interpretation": ("Wrong interpretation or assumption",
                       "misread the question or data, or wrong assumption (e.g. wrong flow regime, direction, basis, "
                       "which quantity is asked for)"),
}

# Decision rules, applied in this order; the first that fits gives the type. Shown on the Methodology tab.
RULES = [
    "If the part only reuses an earlier wrong value of the same reply and is otherwise right, it takes the type of "
    "that earlier mistake and its note starts \"Carried from (x):\". If it reuses several wrong values, it "
    "takes the type that comes first in this list.",
    "Missing or incomplete: the part is not answered, the reply is cut off, there is no final value, or a value is "
    "given with no working where the rubric requires the method to be shown.",
    "Wrong interpretation or assumption: the question or data was misread, the wrong quantity was answered, or a "
    "wrong physical assumption was made (flow regime, flow direction, phase, basis), even if the formula then used "
    "is correct for that assumption.",
    "Wrong method or model: the overall approach cannot give the answer (wrong balance, wrong procedure, "
    "a missing or invented step).",
    "Wrong formula or correlation: the approach is right but an equation, correlation, coefficient or constant is "
    "wrong or misremembered (for example the area of a circle as pi D^2).",
    "Unit or conversion error: the method and formula are right but a unit conversion is wrong or missing.",
    "Numerical or arithmetic slip: method, formula and units are right but the number is wrong (arithmetic, "
    "rounding, interpolation, an iteration stopped early).",
]

ORDER = ("incomplete", "interpretation", "method", "formula", "units", "numerical")   # rule order of the types above
