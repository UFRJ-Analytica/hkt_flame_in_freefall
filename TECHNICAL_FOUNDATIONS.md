# HabitatFire: Technical Foundations

**Companion to PROJECT.md.** Scientific scope for an evidence-first product: use user intent and the selected 3D structure to discover, compare and explain research. Keep interactive, illustrative/data-informed fire scenarios as a differentiator, not as a claim of validated cabin prediction.

**Documentation correction:** 2026-11-14.
**Citation discipline:** earlier citations and numerical tables are retained as historical research references, not newly audited facts, current operational standards or certification. Items marked **[unverified]** are not established evidence. New scope references are in Part E; this correction does not revalidate every earlier source.

**Implemented baseline:** Vite, React, Three.js/React Three Fiber and a local CSV/JSON NASA PSI snapshot, as documented in [DATA_CONNECTION.md](docs/research/DATA_CONNECTION.md). No GP, calibrated cellular automaton, ML predictor, detection probability or suppression-efficacy model was trained by that integration. Parts C and D describe optional, unimplemented research/architecture, not current capabilities or prerequisites for the evidence-first experience.

**Three modes must remain distinct:**

* **Illustrative scenario:** interactive 3D exploration; evidence may inform selected conditions or qualitative behavior. Animation time, flame appearance and spread are illustrative unless individually measured and matched. Display provenance, applied fields, assumptions and gaps; do not export risk probabilities or operational advice.
* **Observed experimental playback:** show the actual source geometry/media and measured variables. Use real time only when timestamps or documented frame timing are available; otherwise label ordering/animation as schematic. A cabin overlay is not a reconstruction of the experiment.
* **Calibrated predictive model (future, gated):** requires matched measurements, calibration, independent hold-out validation and a declared domain/error assessment. Unsupported geometry, material, gravity or endpoint stays unsupported. Failure of this gate must never disable illustrative 3D or evidence retrieval.

---

## Part A. The spacecraft cabin as a physical system

A proposed scenario can organize cabin context into six groups of variables. Field names below are historical/proposed mappings, not a guarantee that the current `Scenario` implements them or that these variables alone determine fire behavior.

### A.1 Atmosphere

Historical ISS US segment reference at 101.3 kPa nominal ([NTRS 20120015343](https://ntrs.nasa.gov/api/citations/20120015343/downloads/20120015343.pdf), Table 1):

| Variable | Specified range | Scenario field |
| --- | --- | --- |
| Total pressure | 97.9 to 102.7 kPa | proposed retrieval field `pressure_kpa`; legacy sketches used psi |
| ppO2 | 19.5 to 23.1 kPa | derived from `o2_pct` × pressure |
| ppCO2 | 0.7 to 1 kPa | not modeled (fixed) |
| ppN2 | < 80 kPa | `diluent` |
| Temperature | 17.8 to 26.7 °C | `temperature_c` (new, v1.3) |
| Relative humidity | 25 to 70 % | `relative_humidity_pct` (new, v1.3) |
| Cabin air velocity | 5 to 20 cm/s | `flow_cm_s` |
| Particulate mass | < 0.05 mg/m³ avg, < 1 mg/m³ peak | detector noise floor |

Historical habitable-atmosphere reference, not a universal scenario-validation or fire-safety envelope ([OCHMO-TB-003](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf)):

* Indefinite crew exposure: 34.5 kPa < P ≤ 103 kPa (5.0 to 15.0 psia).
* At least 30 % diluent gas (O2 capped near 70 % mole fraction at reduced pressure).
* Hypoxia floor (1 hr TWA): inspired ppO2 122 mmHg.
* Max cabin pressure change rate: 13.5 psi/min.

Historical exploration design points ([NTRS 20130011191](https://ntrs.nasa.gov/api/citations/20130011191/downloads/20130011191.pdf)): Orion lunar transit 10.2 psia, Altair lander 8.3 psia. The paper notes these programs were later descoped, so treat as design references, not current baselines.

**Not verified:** current vehicle-specific atmosphere tables for Orion, Dragon, Starliner and Cygnus crew variants. The earlier preset proposal used the ISS reference as "Earth cabin" and 10.2 psia as "exploration atmosphere"; neither establishes a current vehicle baseline.

**Use in retrieval:** compare oxygen fraction, total pressure, diluent and local flow together with fuel, geometry and gravity. The historical ventilation range alone does not establish a universal non-monotone response or a calibrated "hidden-risk zone" for a cabin.

### A.2 Volume and geometry

| Vehicle | Historical reported/reference volume (not audited usable cabin volume) | Source |
| --- | --- | --- |
| Orion | 15 m³ | NASA-STD-6001B §7.7 (Test 7 calculation volume) |
| ISS | 118 m³ (Test 7 reference) | NASA-STD-6001B §7.7 |
| Shuttle | 65 m³ | NASA-STD-6001B §7.7 |
| Cygnus (Saffire IV model) | 10.9 m³ | [NTRS 20220002714](https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf) |

Destiny module ventilation is about 1,100 m³/h; the avionics cooling duct about 9,000 L/min ([NTRS 20170002629](https://ntrs.nasa.gov/api/citations/20170002629/downloads/20170002629.pdf)).

**Scope correction:** the 15 m³ Test 7 calculation reference must not silently replace template geometry or be represented as verified usable Orion cabin volume.

**Not verified:** per-module pressurized volumes (Destiny, Columbus, Kibo), rack counts, cable penetration density, hatch cross sections. Template geometry for ISS US Lab uses public approximate dimensions (4.3 m × 8.5 m) and must be labeled "approximate" in the UI.

### A.3 Materials

Historical NASA-STD-6001B research notes describe material qualification tests ([NASA-STD-6001B w/ Change 2](https://standards.nasa.gov/sites/default/files/standards/NASA/B-w/CHANGE-2/2/NASA-STD-6001B-w-Change-2_Admin-Change.pdf)):

**Test 1, upward flame propagation (§7.1).** Five vertical specimens, 30 × 6.5 cm. Chemical igniter burns 25 s ([NTRS 20150004099](https://ntrs.nasa.gov/api/citations/20150004099/downloads/20150004099.pdf)). Pass if no specimen burns more than 15.2 cm and none transfers flame by burning debris. Pass is valid only at the atmosphere tested.

**Test 4, wire insulation (§7.4).** Five specimens 1.2 m long, 30 cm active, 15° from vertical. Same pass criteria as Test 1.

**Test 7, offgassing (§7.7).** 50 °C for 72 h. Pass if total T ≤ 0.5 (T = concentration / SMAC per compound).

**Historical rationale for investigating transfer between regimes, not a product safety margin.** Hirsch et al. note that Test 1 "has been criticized as an ignition test rather than a flammability test" ([NTRS 20150004099](https://ntrs.nasa.gov/api/citations/20150004099/downloads/20150004099.pdf)). The 15.2 cm criterion can be reached during the acceleratory growth phase, before steady flame is established. A material can therefore pass at 1g and still sustain combustion in slow microgravity flow. The authors propose a microgravity limit μNULP = NULP + SF, with SF "on the order of 10 kPa", and report Nomex NULP of about 90 kPa at 1g.

**Material oxygen limits** in 70.1 kPa quiescent air ([NTRS 20070018178](https://ntrs.nasa.gov/api/citations/20070018178/downloads/20070018178.pdf)). MOC is typically 1 to 3 % below ULOI.

| Material | ULOI % | MOC % |
| --- | --- | --- |
| Nomex, double layer, 15° | 37.1 | 36 |
| Nomex, single layer | < 30 | < 30 |
| Lexan F-6000 | 41.4 | 39 |
| Lexan 6006 | | < 30 |
| Ultem 2310 | 46.4 | 44 |
| Zotek F30 foam | 46.2 | 45 |
| Solimide AC-530 foam | 35.3 | 33 |
| P1700 polysulfone | | 29 |
| Kydex 100 | | 33 |
| SYGEF | | 34 |
| Torlon 4203, Ryton R-4-06, Armalon TG4060 | | > 40 |
| Fiberite HMF 5-322/54-2A, bismaleimide/graphite | | > 99.5 |

These historical rows may support retrieval with the original method, pressure, specimen and gravity attached. They do not supply a universal hard cutoff, a near-zero ignition probability or a transferable microgravity limit. Do not clamp scenario ignition using a 1g MOC/ULOI table or treat a nominal material name as a matched specimen.

**Saffire sample materials** ([NTRS 20170002628](https://ntrs.nasa.gov/api/citations/20170002628/downloads/20170002628.pdf)): SIBAL cloth (75 % cotton, 25 % fiberglass) in Saffire I and III; PMMA flat and structured, three silicone thicknesses, Nomex with PMMA igniter in Saffire II. Sample card 0.4 × 0.95 m. Flow ~20 cm/s in Saffire I, ~30 cm/s in Saffire III.

### A.4 Ignition sources

Two source examples were compared under the reported study conditions ([NTRS 20260001600](https://ntrs.nasa.gov/api/citations/20260001600/downloads/Spacecraft%20Fire%20Safety%20Predictions.pdf)):

| Source | Peak heat release | Total heat | Note |
| --- | --- | --- | --- |
| SIBAL burn, Saffire VI (54.1 kPa, 31 % O2) | 0.45 kW | 124 kJ | spread ended at ~140 s |
| Lithium-ion battery fire (same analysis) | 23.63 kW | 798 kJ | outlet exceeded 450 °C |

These two study examples do not establish a universal battery-to-fabric ratio. Proposed `ignition_source` values (`electrical_overheat`, `li_ion_battery`, `hot_wire`) describe scenario context; they do not determine a validated heat-release history or propagation outcome.

### A.5 Detection

Historical detector research notes (specific devices and test conditions; not current fleet-wide facts) ([NTRS 20210022143](https://ntrs.nasa.gov/api/citations/20210022143/downloads/Fire%20detection%20white%20paper%20final%20211031.pdf), [NTRS 20070031686](https://ntrs.nasa.gov/api/citations/20070031686/downloads/20070031686.pdf), [NTRS 20170002629](https://ntrs.nasa.gov/api/citations/20170002629/downloads/20170002629.pdf)):

* **Placement:** the cited return-vent placement motivates tracking airflow paths, not distance alone. Do not assume a return vent is the only possible transport or sensing path.
* **Principle:** forward light scattering, two-pass IR laser diode, 30° scattering angle.
* **Sensitivity:** most sensitive to particles > 1 µm; minimum reported 0.3 µm.
* **Threshold:** 3.3 % obscuration per meter; ~10 mg/m³ in mixed-system analysis.
* **Known misses:** in SAME ground tests the detector "failed to alarm for Kapton smoke in half of the tests and for Teflon smoke in two-thirds of the tests".
* **Size mismatch:** ground reference aerosols from spacecraft materials have mass mean diameters of 0.101 to 0.619 µm, largely below the detector's sensitivity peak.
* **Microgravity effect:** below 8.1 cm/s forced flow, smoke particles grow larger than in matching 1g tests, because they stay longer near the pyrolyzing source.
* **Filtration race:** ECLSS HEPA filtration can remove early-fire smoke faster than it accumulates, delaying or defeating detection.
* **Dust nuisance:** retain the cited historical context only; this is not a recommendation to disable a detector or a claim about current crew procedure.

SAME used a P-Trak condensation nuclei counter, a residential ionization chamber, and DustTrak light-scattering monitors ([NTRS 20120012884](https://ntrs.nasa.gov/api/citations/20120012884/downloads/20120012884.pdf)). SAME-R is named in the challenge brief itself; the research pass did not locate its standalone NTRS report, so cite it via its PSI entry only.

**Consequence for evidence retrieval:** surface/material selection should retrieve smoke-generation, aerosol, transport, filtration and device-specific studies. Do not report a detection probability or alarm time without matched measurements and validation; the historical miss fractions above are not priors for a present cabin.

### A.6 Suppression

* Historical development/deployment discussion of **fine water mist PFE** and limitations of CO2 against stored-energy fires ([NTRS 20180005251](https://ntrs.nasa.gov/api/citations/20180005251/downloads/20180005251.pdf)).
* In the cited Li-ion camcorder-pack tests, pulsed discharge was reported to outperform immediate full discharge; do not generalize to all agents, batteries or applications.
* Historical device/application distances: 1.2 m engagement and ~1.8 m qualification in the cited account; neither is a spherical suppression radius.
* Orion water spray PFE: 2.5 lb water, 200 to 300 psi nitrogen (same source; Orion, not ISS).
* Historical post-fire gas-monitoring discussion includes HCN and the Contingency Gas Analyzer (O2, CO2, CO, HCN, HCl, pressure); it does not define a complete present-day re-entry or cleanup rule ([NTRS 20100018591](https://ntrs.nasa.gov/api/citations/20100018591/downloads/20100018591.pdf)).

**Scope correction:** no universal fine-mist-first, ventilation-shutdown or CO2 ranking is supported. Retrieve agent-, source-, geometry- and application-specific evidence; do not prescribe dosage, standoff, tactics or guaranteed efficacy. BASS describes how a suppressant jet can entrain oxygen and worsen a flame depending on application geometry (Part E, BASS).

**Not verified:** ISS PFE water mass, N2 pressure, droplet size, discharge duration; CSA-CP thresholds (behind SAE paywall); ISS Fire 1/2/3 response procedure trees.

---

## Part B. Scientific scope for evidence and illustrative scenarios

### B.1 Microgravity flame behavior

Microgravity reduces buoyant transport; forced flow and diffusion remain relevant. Spherical blue flames are regime-specific examples, not a universal appearance for solid, liquid and gas fires (Part E, Researcher's Guide). In product terms, flame appearance is illustrative unless tied to a documented experiment; ventilation is not the sole possible oxidizer-transport mechanism.

### B.2 Historical measured anchors (earlier citations, not newly audited)

Keep these values attached to the cited specimen, apparatus and conditions. The grouped PMMA rows refer to the opposed-flow cylinder study above them, not all PMMA shapes, diameters or cabin fires. No row is automatically a normalized CSV training target; pressure, geometry, timing and endpoint must first be checked against the primary record.

| Material | Conditions | Result | Source |
| --- | --- | --- | --- |
| SIBAL (cotton blend) | 21 % O2, 1 atm, 20 cm/s concurrent, µg | max spread 3.60 mm/s | [NTRS 20220002714](https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf) |
| PMMA rods 6.4 to 12.7 mm | 15 to 21 % O2, 0.4 to 8 cm/s opposed, µg | no spread below 0.6 cm/s; spread rises then falls with flow; ~linear in O2 | [Zhao et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5760683) |
| PMMA rods | 21 % O2 | 1g spreads faster than µg | Zhao et al. 2017 |
| PMMA rods | < 19 % O2 | µg spreads faster than 1g | Zhao et al. 2017 |
| PMMA rods | 17 % O2 | µg flame persisted; 1g flames died below 18 % | Zhao et al. 2017 |
| SIBAL, Saffire VI | 54.1 kPa, 31 % O2 | spread ended ~140 s, 0.45 kW peak | [NTRS 20260001600](https://ntrs.nasa.gov/api/citations/20260001600/downloads/Spacecraft%20Fire%20Safety%20Predictions.pdf) |

**[unverified]** Exact PMMA spread rates in mm/s (they sit in Zhao et al. figures and supplementary tables, not the article text). Literature order of magnitude 0.1 to 2 mm/s is a working prior only.

### B.3 Regime-specific observations, not universal simulator rules

1. **Low-flow limits:** the cited PMMA-cylinder observations do not define a material-only flow threshold. Zero ventilation is not guaranteed extinction (Part E, Researcher's Guide).
2. **Flow dependence:** the earlier PMMA study reports a non-monotone response in its tested domain. Do not hard-code either linear or hump-shaped behavior for all fuels/geometries.
3. **Oxygen/gravity comparison:** retain the earlier PMMA crossover only as a study-specific observation. Do not transfer its approximate oxygen crossover, monotonicity or extinction limit to other specimens, atmospheres or gravity levels.

### B.4 Opposed versus concurrent flow

Opposed spread is into incoming air; concurrent spread follows it. Directional preference depends on regime: the Researcher's Guide describes preferential opposed spread at low flow (Part E). Thus no universal downstream > upstream multiplier is justified. de Ris (1969) remains an **[unverified, not fetched]** thermally-thin research reference, not validation of a cabin transition rule.

### B.5 Endpoints and gravity transfer

Visible-flame extinction is not proof that all combustion has stopped; FLEX cool-flame behavior illustrates this distinction (Part E, Researcher's Guide). Preserve source-specific endpoints such as hot-flame extinction, cool-flame extinction and test termination instead of creating one binary outcome. For lunar contexts, 0g is not an established conservative upper bound for 1/6g. FM2 is a research reference for that gap, not evidence of a calibrated lunar dataset in this snapshot (Part E, FM2).

---

## Part C. Optional, unimplemented mathematical research design

Everything in this part is a candidate design, not deployed behavior, an acceptance prerequisite, measured probability or safety guarantee. Missing measurements must remain missing; illustrative mode must not silently substitute these equations for calibration.

### C.1 Family: stochastic cellular automaton with per-cell Markov chain

A possible future approach is the probabilistic cellular automaton (PCA) family used in wildland fire research: Karafyllidis and Thanailakis (1997) **[original PDF unverified, described via secondary sources]**, the Alexandridis et al. (2008) probabilistic transition ([PDF](https://sfu.ca/geog/soils/article_PDF/Design%20and%20implementation%20of%20an%20integrated%20GIS-based%20cellular%20automata%20model%20to%20characterize%20forest%20fire%20behaviour.pdf)), and recent work such as Dahal and Ergezer ([arXiv:2403.08817](https://arxiv.org/pdf/2403.08817)) and Yuan et al. ([arXiv:2306.03214](https://arxiv.org/pdf/2306.03214)).

Adapting terrain/vegetation/wind concepts to cabin surfaces/materials/ventilation is a research hypothesis, not a validated equivalence. A Markov formulation must include accumulated exposure, remaining fuel and any necessary thermal/history variables in the state; the five-valued state alone is not memoryless while also depending on past exposure.

### C.2 Rothermel as structural template

Rothermel (1972) ([USFS INT-RP-115](https://wiki.openwfm.org/images/5/52/Rothermel-1972-MMP.pdf)) gives the canonical factorization of spread:

```latex
R = \frac{I_R \, \xi \, (1 + \varphi_w + \varphi_s)}{\rho_b \, \varepsilon \, Q_{ig}}
```

Fuel-intrinsic terms (reaction intensity, heating number, heat of preignition) times geometric coupling times environmental multipliers are a possible structural analogy only; neither wildland coefficients nor validated spacecraft physics follow from this factorization.

### C.3 Transition rule

In the candidate design, a cell has a display state among: `intact (0)`, `heating (1)`, `ignited (2)`, `burning (3)`, `burned_out (4)`. Per timestep Δt:

**intact → heating.** Following the Alexandridis multiplicative form:

```latex
p_{0 \to 1}(i) = 1 - \prod_{j \in \mathcal{N}(i),\ s_j = 3} \left(1 - p_{ij}\right),
\qquad
p_{ij} = p_0 \cdot g_{\text{mat}}(i) \cdot g_{O_2} \cdot g_{\text{flow}}(\hat{u} \cdot \hat{d}_{ij}) \cdot g_{\text{geom}}(i,j)
```

* `p_0`: proposed coupling to estimate only against matched spread measurements (C.4–C.5).
* `g_mat`: proposed specimen-specific response; no universal MOC clamp.
* `g_O2`: proposed response within the measured atmosphere domain; monotonicity needs evidence.
* `g_flow`: regime- and direction-specific response; no preset downstream preference or universal hump.
* `g_geom`: proposed geometric coupling requiring calibration, not an assumed same/cross-surface coefficient.

The product form assumes independent exposures, which needs testing. Factors must yield valid probabilities and have timestep/grid meaning; multiplying unconstrained factors does not ensure either. The displayed heating transition is not itself proof of physical ignition.

**heating → ignited.** Sigmoid in accumulated exposure, as in Dahal and Ergezer:

```latex
p_{1 \to 2}(i) = \frac{1}{1 + \exp\!\left(-k\,(E_i - \theta_{\text{mat}})\right)}
```

`E_i` would be accumulated exposure and must be part of the state; `θ_mat` would require matched solid-ignition-delay measurements. Those labels are not supplied by ACME BRE daily gas-burner counts (DATA_CONNECTION.md). A sigmoid is a candidate parameterization, not a measured ignition law.

**ignited → burning.** A deterministic one-step transition is a proposed computational simplification, not a measured ignition time.

**burning → burned_out.** Proposed geometric duration approximation:

```latex
p_{3 \to 4} = \frac{\Delta t}{\tau_{\text{burn}}(\text{mat}, O_2, u)}
```

This discrete approximation needs valid bounds and timestep checks; it is not a measured duration distribution. Burn durations/speeds are absent from many current CSVs. `burned_out` is a display/model state, not evidence of complete combustion cessation, cooling or safety.

### C.4 Linking cell probability to physical spread rate

For a cell size `h` and timestep Δt, a front advancing at `V_f` mm/s crosses one cell every `h / V_f` seconds. Calibrate `p_0` per scenario so that the **expected** front speed of the CA equals the GP-sampled `V_f`:

```latex
\mathbb{E}[\text{front speed}] \approx \frac{h}{\Delta t}\, p_{\text{eff}} \;\Rightarrow\; p_{\text{eff}} \approx \frac{V_f \, \Delta t}{h}
```

The historical worked example h = 100 mm, Δt = 0.5 s and V_f = 3.6 mm/s gives p_eff ≈ 0.018 per step. This is a one-dimensional numerical approximation, not calibration of a 3D graph. Front speed must be checked independently for the selected grid, neighborhood, transitions and boundary conditions.

**Numerical note:** stochastic cell noise and discretization error are not experimental uncertainty. Smaller cells/timesteps require convergence and runtime checks; neither automatically fixes noise. The historical h and Δt are research examples, not product defaults or confidence bands.

### C.5 Gaussian Process surrogate for spread rate

Candidate inputs include O2 mole fraction, pressure, flow speed and specimen descriptors; geometry, thickness, direction, gravity and heating history cannot be omitted merely because data is missing. Candidate kernel: anisotropic Matérn 5/2 ([GP UQ tutorial, arXiv:2502.03090](https://arxiv.org/html/2502.03090v1)):

```latex
k(x, x') = \sigma_f^2 \left(1 + \sqrt{5}\, r + \tfrac{5}{3} r^2\right) e^{-\sqrt{5}\, r},
\qquad r = \sqrt{\sum_d \frac{(x_d - x'_d)^2}{\ell_d^2}}
```

Historical proposal: estimate hyperparameters by marginal likelihood (`GaussianProcessRegressor`) and consider log-positive spread targets. No such fit or suitable set of ~50 matched points is established here. Extinction/censored values need separate handling; they cannot simply be logged or discarded.

**Posterior variance is model-conditional, not proof of safety or domain validity.** It can be small under misspecification or missing input dimensions. Unsupported gravity, materials or geometries require explicit coverage flags and abstention regardless of variance. The historical density/band-width claims are not results of an actual fit.

Only consider fitting `τ_burn` or `θ_mat` when matched measurements exist. Wide priors or Bayesian ridge do not replace missing experimental labels or justify real-world probabilities.

### C.6 Monte Carlo over trajectories

For each of N trajectories:

1. Sample `V_f ~ GP posterior` at the scenario inputs (one draw per material present).
2. Sample `τ_burn`, `θ_mat` from their posteriors.
3. Run the CA for T / Δt steps with an independent RNG stream.
4. Record per-cell state history (or only the per-step burning mask, to save memory).

Candidate aggregates include model-conditional burning frequency and front reach. Alarm/critical times and breach probabilities additionally require validated endpoint submodels. Sampling propagates only the stochastic assumptions and parameter uncertainty represented in the model; it does not cover omitted physics or establish experimental uncertainty.

Historical N = 200/2000 and P5/P50/P95 are optional numerical-design examples. More trajectories reduce Monte Carlo error, not model bias or missing evidence; do not label a larger run "high confidence". Percentiles remain conditional research outputs, not calibrated risk bands.

### C.7 Percolation sanity check

Historical research notes retain a 2D square-lattice site threshold p_c ≈ 0.5927 and forest-fire exponent τ ≈ 1.15 ([Pruessner, arXiv:adap-org/9706005](https://web3.arxiv.org/pdf/adap-org/9706005)); neither numerical reference is newly audited. A temporal transition probability is not a site-occupation probability, and a cabin graph is not this lattice. Do not use this shortcut to assert self-containment, safety or a fast risk verdict.

### C.8 Detection submodel

Simplified source-to-vent transport:

```latex
C_{\text{vent}}(t) = \frac{\dot{m}_{\text{smoke}}(t)}{\dot{V}_{\text{vent}}} \cdot \eta_{\text{path}} \cdot e^{-\lambda_{\text{filter}} t}
```

* `ṁ_smoke` from burning cell count × material smoke yield (literature priors, wide).
* `V̇_vent` from the module ventilation rate (Destiny ~1,100 m³/h).
* `η_path` from the airflow graph distance between fire cells and the return vent.
* A proposed probability factorization would require validated transport, detector response and dependence assumptions. Do not assign the historical Kapton/Teflon test miss fractions to current scenarios or treat them as universal priors.

This is an unimplemented first-order sketch, not a replacement already made. The equation lacks validated transient transport/residence-time and device response; airflow graph distance alone does not calibrate `η_path`. Without matched data, show relevant studies and gaps, not an alarm time/probability.

### C.9 Suppression submodel

An intervention at `t_deploy` is an optional research design requiring agent-, nozzle-, source-, geometry- and flow-specific measurements. No efficacy curve, dosage, engagement radius or operational ranking is implemented or justified here. A historical standoff is not a spatial kill radius. Suppression need not monotonically improve an outcome; BASS discusses oxygen entrainment (Part E).

Ventilation shutdown changes transport but does not guarantee extinction, eliminate diffusion or establish detector response. CO2 behavior also depends on source and application; do not replace one blanket efficacy claim with another.

The fraction of toy trajectories with zero displayed burning cells is only a model statistic. It is not containment probability, total combustion cessation or a safe-re-entry criterion; cool flames, residual heat and stored-energy hazards are not represented by that count.

### C.10 Positioning versus CFD

NASA Glenn models Saffire IV and VI with NIST FDS via PyroSim, representing the fire as a **prescribed** heat addition and species source; in one study "no combustion or flame properties were used in the model" ([NTRS 20260001600](https://ntrs.nasa.gov/api/citations/20260001600/downloads/Spacecraft%20Fire%20Safety%20Predictions.pdf)). The Saffire IV model overpredicted steady CO2 and peak temperature and cooled faster than measured ([NTRS 20220002714](https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf)).

Those particular CFD studies do not establish what every CFD model does, a universal runtime or a benchmark against HabitatFire. No trained source/spread model or measured thousands-of-futures performance is delivered here.

**Defensible product claim:** "HabitatFire connects interactive 3D scenario exploration with traceable NASA research, comparable conditions and explicit evidence gaps. Its current fire visualization is illustrative/data-informed, not a validated predictive solver." Keep CFD/model-comparison claims gated on an actual matched benchmark.

### C.11 Conditional research validation plan (not current acceptance gates)

1. Inventory actual spread, duration and ignition-delay measurements with units, censoring, specimen, geometry, atmosphere, flow direction and gravity. Metadata/session counts are not labels.
2. If a CA is attempted, check front-speed consistency, probability bounds and grid/timestep convergence. Agreement with its own GP is numerical consistency, not independent physical validation.
3. Reserve independent experiments/specimens for hold-out only when targets and conditions are compatible. The historical Saffire-II/MAPE < 30 % proposal is not an achieved result or a presently justified pass threshold.
4. Scope any crossover/low-flow check to the original PMMA apparatus and conditions; do not make 0.6 cm/s a universal no-spread test.
5. Report coverage, errors and failures; abstain from predictions outside validation. The current evidence/illustrative product remains usable if no calibration dataset or valid predictive model exists.

---

## Part D. Proposed intent-and-structure intake (not implemented by this document)

### D.1 Pattern

One optional future Python/backend approach is a Pydantic schema passed to a function-calling LLM; constrained output validated before anything runs. This is the "instructor" pattern ([Jason Liu, AI Engineer](https://www.ai.engineer/talks/yj-wSRJwrrc-structured-llm-outputs-with-pydantic); [agenta.ai guide](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms); [baseten](https://baseten.co/blog/function-calling-and-structured-output-for-llms); [wandb report](https://wandb.ai/jxnlco/function-calls/reports/Better-Data-Extraction-Using-Pydantic-and-OpenAI-Function-Calls--Vmlldzo0ODU4OTA3)).

### D.2 Prompt contract

1. System prompt states role and **units** (O2 as %, pressure as kPa in the proposed retrieval contract, flow as cm/s, measured times in s). Convert explicitly when reading a source in psi/mmHg; do not inherit the historical backend's pressure_psi convention silently.
2. Few-shot examples of utterance → JSON (at least 5, including one ambiguous and one out-of-range).
3. Enumerated `Literal` sets for vehicle, surfaces, materials, ignition sources.
4. Tools to resolve fuzzy references (`search_material_by_description`, `list_surfaces(vehicle)`).

### D.3 Validate twice

1. **Schema validation** (Pydantic). On `ValidationError`, retry with the error appended. Max 3 retries.
2. **Structural/unit validation:** reject invalid units, invalid percentages and nonexistent structure IDs deterministically. Historical OCHMO values are not a universal fire-physics validator; proposed 0–100 cm/s UI bounds and rack/console-only battery placements are product assumptions, not natural laws. Separately assess evidence coverage; valid JSON and plausible inputs do not validate physics or certify safety.

### D.4 Known failure modes and mitigations

| Failure | Mitigation |
| --- | --- |
| Hallucinated material names | `Literal` enum + retrieval tool + validator |
| Unit drift (m/s vs cm/s, kPa vs psi) | Units in field descriptions + range validators + explicit conversion step |
| Partial fills on long schemas | Defaults from the vehicle template; parser fills only what the user mentioned |
| Plausible but wrong defaults | **Confirmation step**: parsed scenario shown as an editable diff before simulate runs |

### D.5 Placement in the UX

User intent and selected 3D structure jointly define the research question. Controls can edit illustrative conditions; natural language can ask for evidence, explain a selected surface, or propose scenario edits. Show proposed changes before application. Do not silently infer a material, geometry or atmosphere from a vehicle name, or overwrite a user condition from a partially populated source row.

### D.6 Evidence-first retrieval contract

Proposed flow: `user question + selected structure/context → explicit retrieval intent → source filtering/ranking → cited interpretation + gaps → optional confirmed scenario update`.

* Carry stable structure/surface IDs, known material/composition, phase, geometry/thickness, gravity/platform, atmosphere, flow/direction and purpose (prevention, detection or suppression). Keep unknown values null and distinguish user inputs from measured fields.
* Retrieve comparable experimental records separately from explanatory documents/media, metadata-only projects and historical context. Solid-fuel data, liquid droplets, gas burners and aerosol/detector studies answer different questions; topic overlap is not calibration compatibility.
* Rank with an explanation of each match and mismatch; unknown geometry/flow is a gap, not a match. A relevance score is not confidence in safety, efficacy or physical prediction. A small curated retrieval/synthesis flow is sufficient; multiple specialist agents and ML are optional.
* Cite accession, source file/row and document section/figure or media timestamp where available. Preserve original units/tokens alongside normalized fields. Record which conditions can actually be applied and which remain user assumptions; no silent fill-down or invented measurements.
* Return an answer, comparable evidence, applicability limits and missing data, not merely a list of sources. Link evidence back to the selected 3D structure without claiming the source experiment measured that cabin.

The current snapshot's actual scope and caveats remain in DATA_CONNECTION.md: rows mix tests, summaries and references; many lack calibrated spread speeds/burn durations. ACME BRE means Burning Rate Emulator (gas burner), and its daily counts cannot train solid ignition delays. No timestamped playback, new corpus retrieval, LLM pipeline or model training is claimed by this proposed contract.

---

## Part E. Scope references reviewed for this correction

The [official challenge resource tab](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources) and [challenge video](https://www.youtube.com/watch?v=AVuEiKxOpc0) motivate finding relevant investigations, extracting useful data and interpreting research. Their prior local review is context, not a new audit of the live PSI catalog or a requirement for a validated cabin solver.

* **Researcher's Guide (October 2015 edition):** [NASA PDF](https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf?emrc=c9b273), especially Solid-Fuel Combustion/Material Flammability, Low-Stretch Flames, Cool Flames and Spacecraft Fire Safety. Used for the regime/endpoint cautions above; its historical schedules/specifications are not current mission status.
* **BASS:** [NASA investigation PDF](https://www.nasa.gov/wp-content/uploads/2025/07/burning-and-suppression-of-solids-bass.pdf?emrc=3a5c2c), Research Summary and Detailed Research Description. Geometry, nozzle application and oxygen entrainment prevent a universal suppression rule; this reference supplies no calibrated cabin efficacy function.
* **FM2:** [NASA research page](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2), Background/Objectives. Lunar material flammability remains a distinct research domain; a reference page is not a matched measurement dataset or proof that 0g bounds 1/6g.

These three NASA technical references were opened for this correction. Earlier references below remain preserved without claiming full revalidation. The correction changes documentation only; no implementation, deployment or new model results are implied.

---

## Sources

### NASA primary

* [NTRS 20120015343, ISS cabin atmosphere specification](https://ntrs.nasa.gov/api/citations/20120015343/downloads/20120015343.pdf)
* [OCHMO-TB-003, Habitable Atmosphere](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf)
* [NASA-STD-6001B with Change 2](https://standards.nasa.gov/sites/default/files/standards/NASA/B-w/CHANGE-2/2/NASA-STD-6001B-w-Change-2_Admin-Change.pdf)
* [NTRS 20150004099, Hirsch et al., Test 1 and the microgravity gap](https://ntrs.nasa.gov/api/citations/20150004099/downloads/20150004099.pdf)
* [NTRS 20070018178, ULOI and MOC of spacecraft polymers](https://ntrs.nasa.gov/api/citations/20070018178/downloads/20070018178.pdf)
* [NTRS 20170002628, Saffire I to VI description and samples](https://ntrs.nasa.gov/api/citations/20170002628/downloads/20170002628.pdf)
* [NTRS 20210022143, Spacecraft fire detection white paper](https://ntrs.nasa.gov/api/citations/20210022143/downloads/Fire%20detection%20white%20paper%20final%20211031.pdf)
* [NTRS 20070031686, ISS smoke detector principle](https://ntrs.nasa.gov/api/citations/20070031686/downloads/20070031686.pdf)
* [NTRS 20170002629, Smoke aerosol characterization](https://ntrs.nasa.gov/api/citations/20170002629/downloads/20170002629.pdf)
* [NTRS 20120012884, SAME instruments](https://ntrs.nasa.gov/api/citations/20120012884/downloads/20120012884.pdf)
* [NTRS 20100018591, CGA and CSA-CP](https://ntrs.nasa.gov/api/citations/20100018591/downloads/20100018591.pdf)
* [NTRS 20180005251, Fine water mist PFE](https://ntrs.nasa.gov/api/citations/20180005251/downloads/20180005251.pdf)
* [NTRS 20130011191, Orion and Altair reduced cabin pressure](https://ntrs.nasa.gov/api/citations/20130011191/downloads/20130011191.pdf)
* [NTRS 20220002714, Saffire IV FDS model](https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf)
* [NTRS 20260001600, Spacecraft Fire Safety Predictions](https://ntrs.nasa.gov/api/citations/20260001600/downloads/Spacecraft%20Fire%20Safety%20Predictions.pdf)
* [NTRS 20240005249, ISS ECLSS events 2023](https://ntrs.nasa.gov/api/citations/20240005249/downloads/ICES-2024-141%20ECLS%20Overview%20of%20Events%202023%20Final.pdf)
* [NASA SoFIE investigation](https://science.nasa.gov/biological-physical/investigations/sofie)

### Peer-reviewed and preprints

* [Zhao et al., Effect of gravity on flame spread over PMMA cylinders, Sci. Rep. 7:18398 (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5760683)
* [Rothermel, USFS INT-RP-115 (1972)](https://wiki.openwfm.org/images/5/52/Rothermel-1972-MMP.pdf)
* [Alexandridis et al., GIS-based CA fire model (2008)](https://sfu.ca/geog/soils/article_PDF/Design%20and%20implementation%20of%20an%20integrated%20GIS-based%20cellular%20automata%20model%20to%20characterize%20forest%20fire%20behaviour.pdf)
* [Dahal and Ergezer, Fire spread modeling using probabilistic CA, arXiv:2403.08817](https://arxiv.org/pdf/2403.08817)
* [Yuan et al., Data-driven wildfire spread with stochastic CA, arXiv:2306.03214](https://arxiv.org/pdf/2306.03214)
* [Pruessner, Bak-Chen-Tang forest fire model revisited, arXiv:adap-org/9706005](https://web3.arxiv.org/pdf/adap-org/9706005)
* [GP regression for UQ tutorial, arXiv:2502.03090](https://arxiv.org/html/2502.03090v1)
* [Saffire overview, eoPortal](https://eoportal.org/satellite-missions/saffire)
* [NIST TN 1889v3, fire model validation](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1889v3.pdf)

### Canonical, not fetched this session

Rasmussen and Williams, *Gaussian Processes for Machine Learning* (MIT Press 2006). Kennedy and O'Hagan, Bayesian calibration of computer models (JRSS-B 2001). de Ris (1969) thermally thin opposed-flow spread. Karafyllidis and Thanailakis, *Ecological Modelling* 99 (1997).

### Open research items (not a deadline or evidence-first release blocker)

1. PMMA spread rate values from Zhao et al. supplementary tables (S1, S2).
2. Matched Saffire I/III spread-rate measurements, if an optional future fit is pursued; imported summary rows alone are insufficient.
3. Material smoke yields for the detection submodel (literature priors).
4. ISS PFE specifics (NTRS 20130011664).
