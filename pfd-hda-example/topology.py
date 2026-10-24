"""Frozen topology of the toluene hydrodealkylation (HDA) plant, PFD-201/PFD-202.

Step 1 and step 2 of the PFD-SPEC-001 layout procedure: node list with the
Annex A symbol variant (library key) for every equipment item, and the edge
list with the port at each stream end. Layout scripts and the verifier read
this file; no layout step may change it. Writes topology.json.

Node kinds: 'equip' (library symbol), 'junction' (mixing or splitting point,
drawn as a junction dot), 'terminal' (feed/product arrow or sheet
continuation).
"""
import json, pathlib

# id: (kind, sheet(s), library key, tag, service)
NODES = {
    # ---- sheet 1: reaction section (PFD-201) ----
    "FT":    ("terminal", [1], "feed_1", "", "Fresh toluene"),
    "FH":    ("terminal", [1], "feed_1", "", "Hydrogen make-up"),
    "J1":    ("junction", [1], None, "", "toluene + recycle toluene"),
    "V-201": ("equip", [1], "vessel_1", "V-201", "Toluene feed drum"),
    "P-201": ("equip", [1], "pump_1", "P-201", "Toluene feed pump"),
    "J2":    ("junction", [1], None, "", "make-up H2 + recycle gas"),
    "J3":    ("junction", [1], None, "", "gas + liquid toluene"),
    "E-201": ("equip", [1], "heat_exchanger_1", "E-201", "Feed preheater"),
    "H-201": ("equip", [1], "fired_heater_x", "H-201", "Feed heater (furnace)"),
    "R-201": ("equip", [1], "packed_reactor_x", "R-201", "HDA reactor"),
    "E-202": ("equip", [1], "heat_exchanger_1", "E-202", "Effluent cooler"),
    "V-202": ("equip", [1], "flash_1", "V-202", "High-pressure separator"),
    "J4":    ("junction", [1], None, "", "purge split"),
    "C-201": ("equip", [1], "compressor_1", "C-201", "Recycle gas compressor"),
    "LV-201": ("equip", [1], "control_valve_1", "LV-201", "Level control valve"),
    "PV-201": ("equip", [1], "control_valve_1", "PV-201", "Purge pressure control valve"),
    "V-203": ("equip", [1], "flash_1", "V-203", "Low-pressure flash drum"),
    "J5":    ("junction", [1], None, "", "fuel gas mix"),
    "FG":    ("terminal", [1], "product_1", "", "Fuel gas"),
    "OUT21": ("terminal", [1], "product_1", "", "To PFD-202 (column feed)"),
    "IN38":  ("terminal", [1], "feed_1", "", "From PFD-202 (toluene recycle)"),
    # ---- sheet 2: separation section (PFD-202) ----
    "IN21":  ("terminal", [2], "feed_1", "", "From PFD-201 (column feed)"),
    "E-203": ("equip", [2], "heat_exchanger_1", "E-203", "Column feed heater"),
    "T-201": ("equip", [2], "scds_1", "T-201", "Benzene column"),
    "E-204": ("equip", [2], "heat_exchanger_1", "E-204", "Benzene condenser"),
    "V-204": ("equip", [2], "vessel_1", "V-204", "Benzene reflux drum"),
    "P-202": ("equip", [2], "pump_1", "P-202", "Benzene reflux pump"),
    "J6":    ("junction", [2], None, "", "reflux / benzene product split"),
    "E-205": ("equip", [2], "heat_exchanger_1", "E-205", "Benzene column reboiler"),
    "T-202": ("equip", [2], "scds_1", "T-202", "Toluene column"),
    "E-206": ("equip", [2], "heat_exchanger_1", "E-206", "Toluene condenser"),
    "V-205": ("equip", [2], "vessel_1", "V-205", "Toluene reflux drum"),
    "P-203": ("equip", [2], "pump_1", "P-203", "Toluene reflux pump"),
    "J7":    ("junction", [2], None, "", "reflux / toluene recycle split"),
    "E-207": ("equip", [2], "heat_exchanger_1", "E-207", "Toluene column reboiler"),
    "LE":    ("terminal", [2], "product_1", "", "Light ends to fuel gas"),
    "BZ":    ("terminal", [2], "product_1", "", "Benzene product"),
    "DP":    ("terminal", [2], "product_1", "", "Diphenyl (heavy ends) to fuel"),
    "OUT38": ("terminal", [2], "product_1", "", "To PFD-201 (toluene recycle)"),
}

# number: (from node, from port, to node, to port, sheet(s), description)
# Column side entries use port names 'side_left' / 'side_right': a point on the
# shell side whose height the layout chooses (Annex A.9: feed at the left,
# reflux and boil-up at the right). Junctions use port 'j'.
EDGES = {
    1:  ("FT", "outlet", "J1", "j", [1], "Fresh toluene"),
    2:  ("J1", "j", "V-201", "inlet", [1], "Toluene to feed drum"),
    3:  ("V-201", "bottom", "P-201", "suction", [1], "Toluene to pump"),
    4:  ("P-201", "discharge", "J3", "j", [1], "Toluene to reactor feed"),
    5:  ("FH", "outlet", "J2", "j", [1], "Hydrogen make-up"),
    6:  ("J2", "j", "J3", "j", [1], "Combined gas"),
    7:  ("J3", "j", "E-201", "left", [1], "Reactor feed"),
    8:  ("E-201", "right", "H-201", "coil_in", [1], "Preheated feed"),
    9:  ("H-201", "coil_out", "R-201", "top", [1], "Reactor inlet"),
    10: ("R-201", "bottom", "E-202", "left", [1], "Reactor effluent"),
    11: ("E-202", "right", "V-202", "side_3", [1], "Cooled effluent"),
    12: ("V-202", "top", "J4", "j", [1], "Separator vapour"),
    13: ("J4", "j", "PV-201", "left", [1], "Purge"),
    14: ("J4", "j", "C-201", "suction", [1], "Recycle gas to compressor"),
    15: ("C-201", "discharge", "J2", "j", [1], "Recycle gas"),
    16: ("V-202", "bottom", "LV-201", "left", [1], "Separator liquid"),
    17: ("LV-201", "right", "V-203", "side_3", [1], "Let-down liquid"),
    18: ("V-203", "top", "J5", "j", [1], "Flash gas"),
    19: ("J5", "j", "FG", "inlet_edge", [1], "Fuel gas"),
    20: ("V-203", "bottom", "OUT21", "inlet_edge", [1], "Crude benzene"),
    # stream 20 leaves PFD-201 and continues on PFD-202 (R9, see CONTINUATIONS)
    21: ("E-203", "right", "T-201", "side_left", [2], "Column feed"),
    22: ("T-201", "overhead", "E-204", "left", [2], "Benzene column overhead"),
    23: ("E-204", "right", "V-204", "inlet", [2], "Condensate"),
    24: ("V-204", "outlet", "LE", "inlet_edge", [2], "Light ends"),
    25: ("V-204", "bottom", "P-202", "suction", [2], "Reflux drum liquid"),
    26: ("P-202", "discharge", "J6", "j", [2], "Pump discharge"),
    27: ("J6", "j", "T-201", "side_right", [2], "Benzene column reflux"),
    28: ("J6", "j", "BZ", "inlet_edge", [2], "Benzene product"),
    29: ("T-201", "bottoms", "E-205", "left", [2], "Benzene column bottoms"),
    30: ("E-205", "top", "T-201", "side_right", [2], "Benzene column boil-up"),
    31: ("E-205", "right", "T-202", "side_left", [2], "Toluene column feed"),
    32: ("T-202", "overhead", "E-206", "left", [2], "Toluene column overhead"),
    33: ("E-206", "right", "V-205", "inlet", [2], "Condensate"),
    34: ("V-205", "bottom", "P-203", "suction", [2], "Reflux drum liquid"),
    35: ("P-203", "discharge", "J7", "j", [2], "Pump discharge"),
    36: ("J7", "j", "T-202", "side_right", [2], "Toluene column reflux"),
    37: ("J7", "j", "OUT38", "inlet_edge", [2], "Toluene recycle"),
    38: ("T-202", "bottoms", "E-207", "left", [2], "Toluene column bottoms"),
    39: ("E-207", "top", "T-202", "side_right", [2], "Toluene column boil-up"),
    40: ("E-207", "right", "DP", "inlet_edge", [2], "Diphenyl"),
    41: ("PV-201", "right", "J5", "j", [1], "Let-down purge"),
}
# Sheet continuations (R9): the same stream number on both sheets, leaving and
# entering at the same height (heights fixed by the layout in continuations.json).
#   stream 20 leaves PFD-201 at OUT21 and enters PFD-202 at IN21 -> E-203 left
#   stream 37 leaves PFD-202 at OUT38 and enters PFD-201 at IN38 -> J1
CONTINUATIONS = {
    20: {"sheet1": ("V-203", "bottom", "OUT21", "inlet_edge"),
         "sheet2": ("IN21", "outlet", "E-203", "left")},
    37: {"sheet2": ("J7", "j", "OUT38", "inlet_edge"),
         "sheet1": ("IN38", "outlet", "J1", "j")},
}

# utility connections (energy carriers; not numbered streams)
UTILITIES = {
    "E-201": "HP steam", "H-201": "Fuel gas", "E-202": "Cooling water",
    "E-203": "LP steam", "E-204": "Cooling water", "E-205": "MP steam",
    "E-206": "Cooling water", "E-207": "HP steam",
}

def edges_on_sheet(sheet):
    """Edge list as drawn on one sheet: (n, from, fport, to, tport)."""
    out = []
    for n, (a, ap, b, bp, sh, _) in EDGES.items():
        if n in CONTINUATIONS:
            a, ap, b, bp = CONTINUATIONS[n][f"sheet{sheet}"]
            out.append((n, a, ap, b, bp))
        elif sheet in sh:
            out.append((n, a, ap, b, bp))
    return sorted(out)

if __name__ == "__main__":
    # integrity: every edge endpoint is a node; every node is used
    used = set()
    for n, (a, ap, b, bp, sh, _) in EDGES.items():
        assert a in NODES and b in NODES, n
        used |= {a, b}
    for c in CONTINUATIONS.values():
        used |= {c["sheet1"][0], c["sheet1"][2], c["sheet2"][0], c["sheet2"][2]}
    assert used == set(NODES), set(NODES) - used
    assert sorted(EDGES) == list(range(1, len(EDGES) + 1))
    data = {"nodes": {k: dict(kind=v[0], sheets=v[1], key=v[2], tag=v[3], service=v[4]) for k, v in NODES.items()},
            "edges": {str(n): dict(src=v[0], src_port=v[1], dst=v[2], dst_port=v[3], sheets=v[4], desc=v[5]) for n, v in EDGES.items()},
            "continuations": {str(k): v for k, v in CONTINUATIONS.items()},
            "sheet_edges": {str(s): edges_on_sheet(s) for s in (1, 2)},
            "utilities": UTILITIES}
    pathlib.Path(__file__).with_name("topology.json").write_text(json.dumps(data, indent=1))
    neq = sum(1 for v in NODES.values() if v[0] == "equip")
    print(f"topology OK: {neq} equipment items, {len(NODES)} nodes, {len(EDGES)} streams;"
          f" sheet 1: {len(edges_on_sheet(1))} edges, sheet 2: {len(edges_on_sheet(2))} edges")
