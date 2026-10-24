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
