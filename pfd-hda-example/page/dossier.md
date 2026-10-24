# Research dossier: toluene hydrodealkylation (HDA)

Scope: the plant of `topology.py` (feed drum V-201, pump P-201, preheater E-201, fired heater H-201, adiabatic packed-bed reactor R-201, effluent cooler E-202, high-pressure separator V-202 with recycle gas compressor C-201 and purge via PV-201, low-pressure flash V-203, benzene column T-201, toluene column T-202, diphenyl to fuel). Keys in brackets refer to `references.json`. Every number is quoted as the source states it; conversions are marked "computed". Prices from [8] come from a Douglas-based case study and carry no basis year in the source; they are not current market prices.

## 1. Process description by subunit (diagram order)

**Overall chemistry.** Toluene reacts with hydrogen to benzene and methane; in a side reaction benzene dimerises reversibly, 2 benzene <-> diphenyl + H2 [8]. Unconverted toluene is recycled, diphenyl is separated in the toluene column [8, 13].

**Feed preparation and mixing (V-201, P-201).** Fresh toluene is mixed with recycled toluene, and fresh hydrogen with recycle gas, before the reactor. In the Douglas-based model of [8] the fresh gas is 97% hydrogen and 3% methane, and the methane impurity is one reason a purge is needed [8, 13].

**Heating (E-201, H-201).** The mixed feed is first heated against reactor effluent (feed-effluent exchanger) and then to reaction temperature in a furnace [8]. In [8] the reactor inlet temperature must be at least 1150 F (computed: 621 C) "to get a high enough reaction rate"; the Edinburgh course notes give a rate that is "too slow" below 600 C [13].

**Reactor (R-201).** Two routes exist.
- *Thermal (non-catalytic).* Reaction in the range 600 C to 700 C at about 35 bar; below 600 C the rate is too slow, above 700 C "a significant amount of hydrocracking takes place" [13]. The model of [8] bounds the reactor inlet pressure at 500 psia (computed: 34.5 bar) and the outlet temperature at 1300 F (computed: 704 C).
- *Catalytic.* "Usually supported chromium or molybdenum oxides, platinum or platinum oxides, on silica or alumina", 500 to 595 C, 4-6 MPa (40-60 atm); conversion per pass "typically reach[es] 90%", selectivity to benzene "often >95%"; "lower temperatures and higher selectivities but requires frequent regeneration of the catalyst" [1]. A student document reports the Turton et al. HDA flowsheet as 600-650 C, 20 to 60 bar, "chromia on porous carrier" in a packed-bed reactor [12]; the textbook itself was not read [11].
- *Hydrogen excess and coking.* A hydrogen to aromatics ratio of 5 is required "to prevent coking" [13]; [8] states the constraint as H2/(benzene+toluene+diphenyl) >= 5. In the stream table of [8] the reactor inlet has 1807.4 lbmol/h H2 for 361.5 lbmol/h aromatics (computed ratio 4.9999, i.e. the constraint is active).
- *Heat release, quench.* The reaction is "highly exothermic and the temperature is controlled by injection of quench hydrogen at several places" in the catalytic reactor [1]. In [8] the adiabatic plug-flow reactor outlet is quenched with a portion of the separator liquid "to prevent coking"; the quencher outlet is limited to 1150 F (computed: 621 C). In the Aspen model of [8] the reactor inlet is 1201.2 F and the outlet 1277.2 F (computed: 650 C to 692 C, a rise of 42 K), at 500 psi. This is a model value, not plant data.
- *Kinetics.* A primary-source rate expression was not read; see Section 8.

**Effluent cooling and separation (E-202, V-202, V-203).** The effluent is cooled (in [8] against the feed and then in a cooler) to the separator, where the separator temperature is limited to 95-105 F (computed: 35-41 C) [8]. The vapour (hydrogen, methane) is recycled; liquid goes to stabilisation [8, 13]. The flash does not remove all hydrogen and methane, so a stabiliser removes the remainder "to prevent them from contaminating our benzene product" [13].

**Recycle gas and purge (C-201, PV-201).** Methane "is produced in the reaction and enters as an impurity in the hydrogen stream" and "will accumulate in the gas-recycle loop. Hence a purge stream is required" [13]; [8] likewise purges "to avoid accumulation of methane". In [8] the purge, stabiliser distillate and toluene-column bottoms are sold as fuel.

**Benzene column and toluene column (T-201, T-202).** Benzene is taken overhead in the benzene column; in [8] the specification is a benzene mole fraction of at least 0.9997 in the distillate. The toluene column recovers unreacted toluene (recycled) from diphenyl [8, 13].

**Diphenyl handling.** In [8] and [13] diphenyl is separated from the recycle toluene and removed; in [8] it is sold as fuel. Diphenyl boils at 256.1 C (benzene 80.08 C) [5, 1], which makes the toluene-column bottoms the natural exit. Recycling diphenyl to extinction (the reaction is reversible) was not verified in a source; see Section 8.

## 2. Named commercial processes

- *Detol, Litol, Pyrotol:* catalytic dehydrogenation and dealkylation processes for toluene (Detol), light oil (Litol) and pyrolysis petrol (Pyrotol) to benzene; "exclusively licensed by ... Lummus Technology", catalysts supplied by Clariant [14].
- *Axens thermal HDA:* "a non-catalytic process that achieves nearly theoretical benzene yields"; "more than 35 plants have been licensed worldwide" (vendor claims) [15].
- *Hydeal* (catalytic) and *HDA, THD* (thermal) are named as the main processes in [1]; their licensors were not verified.

## 3. Production scale

- *Worldwide:* "more than 61 million metric tons in 2019" [16] (the authors' statement, citing a market-statistics site).
- *USA:* EPA Chemical Data Reporting aggregated range 15,000,000,000 to under 20,000,000,000 lb for 2023 (computed: 6.8 to 9.1 million t), and the same range for 2021 and 2020; 10 to under 15 billion lb for 2022 [1]. These are reporting ranges, not point values.
- *Share by route (undated text in [1]):* catalytic reforming about 30%; pyrolysis gasoline 30-35%; toluene hydrodealkylation (thermal and catalytic together) 25-30% of the world's total benzene supply. A basis year is not given in [1]; treat as indicative.
- *Why the spread matters.* Dealkylation consumes a cheaper aromatic to make a dearer one. [1] states for the competing toluene disproportionation route that its "economic feasibility ... depends on the relative prices of benzene, toluene, and xylene" and that it is "presently an attractive alternative to hydrodealkylation" when xylene and benzene prices exceed toluene's (undated text). The analogous statement for HDA was not found in a source (Section 8). In the Douglas-based economic data of [8], benzene is 9.04 $/lbmol and toluene 6.04 $/lbmol (computed spread 3.00 $/lbmol, i.e. 33% of the toluene price) [8].

## 4. Process economics

Only figures with a source that was read are given.
- Product and feed values of the Douglas case study, from [8] (Table 7, "based on Douglas (1988)", no basis year stated): benzene 9.04 $/lbmol; toluene 6.04 $/lbmol; fresh gas (97% H2) 1.32 $/lbmol; furnace fuel 4.00e-6 $/Btu; steam 2.50e-6 $/Btu; 8150 h/y operation. Economic potential is the objective (product + by-product fuel value minus feed, fuel, cooling water, power, steam) [8].
- Sample operating point of [8] (Aspen model): fresh toluene 300 lbmol/h, benzene product 268 lbmol/h (computed: 0.893 mol benzene per mol toluene fed), diphenyl bottoms 8 lbmol/h; the paper reports a nominal optimum profit of 4,693.4 k$/year under those prices.
- Capital cost of HDA units, hydrogen cost at current prices and the toluene/benzene price relation over time: not found with a citable open source (Section 8).

## 5. Safety and environment

- *Benzene toxicity.* IARC Group 1, "carcinogenic to humans" (Volume 100F, 2012; Volume 120, 2018) [1]. OSHA: PEL 1 ppm as 8-hour TWA and 5 ppm STEL (15 min) [6, 1]. ACGIH TLV 0.5 ppm TWA and 2.5 ppm STEL, skin, A1 confirmed human carcinogen [1].
- *Flammability (volume % in air).* Hydrogen 4.0-75 [2]; methane 5.3-14.0 [4]; toluene 1.1-7.1 [3]; benzene 1.2-7.8 [1]. Toluene flash point 4.4 C [3]; benzene flash point below 0 F [1]. Hydrogen is also a simple asphyxiant [2]. Toluene is a Class IB flammable liquid [3].
- *High temperature hydrogen attack.* Industry uses API RP 941 and its Nelson curves to judge susceptibility of steels in hydrogen service; the CSB found that HTHA "severely cracked and weakened the carbon steel heat exchanger ... leading to a rupture" at the Tesoro Anacortes refinery, that the carbon steel curve "has repeatedly proven to be unreliable", that the 2016 edition reports 13 new failures below it, and that inspection should not be relied on alone [7]. Relevant here to hot hydrogen-bearing equipment (H-201, R-201, E-201 and E-202 tube sides).
- *Environment.* Benzene enters the environment from "production, storage, transport, venting, and combustion of gasoline" [1]. Fired-heater hazards and emissions data specific to HDA were not found in a read source (Section 8).

## 6. Issues of special concern in HDA

- *Selectivity loss.* The side reaction forms diphenyl, which must be separated and disposed of as fuel [8, 13]; at the sample point of [8], 8 lbmol/h of diphenyl leaves with 268 lbmol/h of benzene product (computed ratio 0.030).
- *Temperature control and runaway.* The reaction is highly exothermic [1]; hydrocracking sets in above about 700 C [13]. [8], reviewing earlier control studies, reports that Wolff (1994) "concluded that the HDA process is controllable provided the instability of the heat-integrated reactor is resolved" [8]. This is a statement of a cited conclusion, not independently checked.
- *Coking.* Prevented by hydrogen excess (ratio >= 5) and the effluent quench [8, 13].
- *Methane build-up and hydrogen loss.* The purge is needed to avoid methane accumulation and necessarily removes some hydrogen [8, 13]. In [8] the purge is sold as fuel.
- *Hydrogen consumption.* One mole of hydrogen is consumed per mole of toluene converted (stoichiometry of [8]); the diphenyl reaction releases hydrogen.

## 7. Case-study role

HDA "was first presented in a contest which the American Institute of Chemical Engineers arranged ... (McKetta, 1977)" and "has been exhaustively studied" for design, controllability and control structure selection [8]. Douglas (1988) "used another version of the HDA process to demonstrate a steady-state procedure for flowsheet design" [8, 9]; the underlying hierarchy of decision levels is published in [10]. Later work built dynamic models and hierarchical control designs on the Douglas version [8]. A student document attributes an HDA flowsheet (Chapter 1, 4th edition) to Turton et al. [12, 11]. Economic potential from Douglas is the objective used in [8].

## 8. Not verified / left out

- Rate expression and activation energy (Zimmerman and York 1964, Crossref-confirmed as "Thermal Demethylation of Toluene", Ind. Eng. Chem. Process Des. Dev.): the paper was not readable; a thesis chapter reproducing it could not be downloaded. Left out.
- Heat of reaction and adiabatic temperature rise from first principles: no source read (only the model values of [8] are quoted).
- Typical thermal HDA residence time and H2/aromatics ranges from patents (US 3,963,794 and others): patent text not readable (image PDF, Google Patents blocked). Left out.
- Licensors of Hydeal, THD, Houdry/ARCO HDA: not verified.
- Capital and operating cost of an HDA unit: the S&P Global PEP review (Axens thermal HDA, 645 million lb/y basis) was visible only as a search snippet (page returned 403); a vendor simulator tutorial (Fives ProSim) gave example costs but states they are not typical, so they are left out. Intratec and Procurement Resource reports are paywalled.
- Current benzene and toluene prices, spread history and current hydrogen cost: no citable open source found.
- Share of benzene made by HDA with a basis year; process-level capacity split: [1] gives shares without a year; ICIS and GlobalData figures are paywalled or snippets.
- IARC Monograph 120 production chapter, ATSDR and NIOSH pages: blocked (HTTP 403 or browser check); their facts are taken through PubChem [1].
- OSHA page itself (HTTP 403): the CFR text was read at the Cornell LII reproduction [6]; the quoted limits agree with PubChem [1].
- Fired heater hazards, flue gas and fuel-gas emissions, methane-rich fuel gas hazards beyond flammable limits: no read source.
- That HDA economics depend on the benzene-toluene spread: the statement in [1] concerns disproportionation; a direct HDA statement was not found in a read source (a journal page snippet was seen but not read).
- Recycling diphenyl versus removing it: no source read.
- Turton et al. and Douglas texts were not read; only bibliographic records and secondary reports of their HDA content are used.
- Reference [8] was read as the authors' submitted manuscript on the NTNU server, not the published version; bibliographic details are from Crossref.
