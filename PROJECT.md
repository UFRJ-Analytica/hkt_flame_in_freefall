# HabitatFire — Project Specification

**Version:** 1.4 (2026-11-14, official-resource review: evidence-first SI dashboard, context-aware hybrid retrieval, interactive 3D scenarios, and explicit simulation fidelity).
**Companion file:** `TECHNICAL_FOUNDATIONS.md` separates scientific references and domain limits from optional modeling hypotheses. Read it before proposing quantitative fire behavior; a cited historical number is not automatically a calibrated parameter.
**Status:** Revised design, not a claim that planned components are implemented. The working slice is React/Vite + React Three Fiber and a local NASA CSV/JSON snapshot. Hybrid RAG, a backend and calibrated predictive models are not implemented. See `docs/architecture/EVIDENCE_RETRIEVAL_AND_SCENARIO.md` for the authoritative retrieval/scenario design and `docs/research/DATA_CONNECTION.md` for actual data coverage.
**Owner:** UFRJ Analytica (Universal Event, NASA Space Apps Challenge 2026).
**Challenge:** Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data.
**Challenge URL:** https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
**Schedule:** Confirm event rules and submission timezone on the official event/project page. Earlier claims of a confirmed 09:00 BRT opening and permitted pre-event implementation/data preparation were not verified; this document does not grant an exception to event rules.

---

## 1. One-liner

HabitatFire is an evidence-driven fire-safety workspace: users explore a habitable environment in 3D, select a structure/material, ask a design question, and discover, rank and interpret relevant NASA combustion investigations with traceable sources. Interactive fire scenarios are a visual differentiator, with explicit separation between illustrative behavior, experimental observations and any future validated prediction.

### 1.1 Delivery priorities and interpretation of this specification

1. **Core challenge:** identify relevant investigations; extract usable data for modeling; interpret research for prevention, detection, suppression and safety equipment. The official video, especially 7:16–8:30, also supports a terrestrial-application extension.
2. **Primary interaction:** question + selected 3D structure/material + visible scenario conditions → hybrid retrieval → ranked investigations/records → cited findings and coverage gaps.
3. **Visual differentiator:** maintain polished module geometry, surface picking, material/atmosphere controls and interactive fire scenarios. The visualization must communicate the fidelity of each output rather than imply cabin-scale validation.
4. **Optional quantitative research:** train or calibrate only a narrowly supported physical target after its observations, units, geometry and validation data are actually available. Neither four agents nor a cabin-wide CA/GP/XGBoost model gates the evidence-first MVP.

Sections 6–7 retain some v1.3 backend/UI research sketches for reference; their hypothetical paths, mandatory numeric fields, agent topology and performance budgets are **not implemented API contracts or current acceptance requirements**. Sections 1.1, 8, 11, 13, 16 and the retrieval/scenario design govern the next slice. The current code lives in `src/`, not `apps/web/`; do not rebuild or migrate it merely to match a legacy sketch.

## 2. Context

### 2.1 Why this exists

The official challenge uses spacecraft fire-safety history and future lunar exploration to motivate the problem. A smoke alarm is not evidence of a confirmed fire. Apollo 1, Apollo 13 and Mir are distinct incidents and environments, not three equivalent microgravity combustion tests. Avoid the stale relative date “three weeks ago” and verify mission chronology before using it in the pitch.

NASA's PSI corpus contains heterogeneous investigations, including experiments, computational work and aggregate/reference tables. Relevant evidence lives in metadata, CSVs, ReadMes, reports, publications, images and videos. Finding and comparing the evidence behind a specific design question is the central discovery problem. Our snapshot covers 24 selected PSI identifiers; this is not a verified claim of complete coverage of the current official search.

HabitatFire connects those sources to an interactive spatial context. A user can inspect relevant investigations, compare observed conditions, explore an explicitly labeled visual scenario and see exactly where experimental evidence ends. A plausible animation is not itself a probabilistic forecast.

### 2.2 Who this is for

**Primary user:** aerospace engineer designing a crewed spacecraft (Orion, Dragon, Starliner, Cygnus crew variants, Soyuz-class vehicles) or an orbital station module (ISS successors like Axiom, Orbital Reef, Starlab).

**Also in scope:** researchers and engineers investigating lunar/Martian surface habitats and pressurized rovers. Lunar relevance is central to the official motivation, not a disqualified use case. Quantitative transfer into unmeasured gravity/geometry remains unsupported until specifically validated.

**Tertiary users:** aerospace researchers running literature reviews, graduate students, and professors teaching spacecraft fire safety.

### 2.3 What NASA asks for (literal from the brief)

Build an SI-powered, web-based dashboard that summarizes, ranks, and interprets combustion science investigations to deliver critical foundational insights for fire safety. Users may:
1. Identify investigations most relevant to fire safety needs of habitable crew environments (spacecraft, stations, lunar/Martian bases, pressurized rovers).
2. Extract data that supports predictive modeling of flammability and fire scenarios.
3. Highlight research that informs development of next-generation fire safety controls and equipment.

Rocket and propellant combustion is explicitly out of scope.

### 2.4 Why the first 3D demonstrators are spacecraft and orbital stations

Orion and an ISS-style module are practical first demonstrators because the interactive scenes already exist. This is a delivery choice, not a claim that the challenge excludes surface habitats.

The official presentation explicitly links lunar surface activity, oxygen-enriched atmospheres and fire-safety research. Evidence discovery and knowledge-gap analysis therefore apply to a lunar habitat even when a validated lunar fire prediction is unavailable.

The corpus must distinguish measured experiments from computational outputs and historical summaries, as well as flight, ground and simulated-gravity conditions. Do not assert that every selected investigation is an ISS/Cygnus flight experiment.

The reviewed sources do not establish validated partial-gravity coverage in our snapshot. FM2 research descriptions and simulated lunar-gravity images are not proof of newly released lunar measurement tables. Catalog future/related research as such and verify availability before ingestion or training.

For surface contexts show “outside measured domain; transfer not validated.” Do not use zero-gravity results as a guaranteed conservative upper bound for lunar conditions. A third full 3D habitat is optional; a well-explained applicability/gap panel is sufficient for the first slice.

### 2.5 Scoring reality and differentiation

Do not rely on unverified team counts, judging outcomes or claims about what competitors will build. Demonstrate challenge coverage through a working user journey and traceable evidence.

The intended differentiation is the integration of:

1. **Interactive 3D interiors** that turn surface/material selection into a meaningful scientific query.
2. **Hybrid evidence retrieval** using intent, exact identifiers and experimental compatibility, with understandable ranking reasons.
3. **Cited synthesis and usable data extraction**, not a generic chatbot or a list of PDFs.
4. **Representative interactive fire scenarios** whose fidelity, observations and assumptions remain visible.
5. **Prevention, detection, suppression, post-fire considerations and terrestrial relevance**, with source provenance and explicit knowledge gaps.

## 3. Scientific grounding

### 3.1 The hidden-risk zone

Three environmental shifts amplify fire risk in crewed spacecraft and orbital stations versus a familiar Earth setting:

**Microgravity changes transport.** Buoyancy-driven convection is strongly reduced; diffusion and forced flow matter. A quiescent diffusion flame may approach a sphere, but geometry, fuel, ventilation and other forcing can produce very different shapes. Neither a spherical flame nor spherical smoke is a universal validation rule.

**Ventilation and regime matter.** Low-flow microgravity can sustain combustion under conditions where a matched 1g reference does not, but the effect is material-, geometry- and condition-dependent. BASS-II has 129 imported rows; its CSV does not itself provide a calibrated velocity for `Fan display`/`Air display` or a universal burn/non-burn label. Flow zero does not imply universal extinction.

**Atmosphere is not a single oxygen knob.** Pressure, oxygen fraction, diluent and their interaction depend on the test regime. The scene presets are exploratory choices, not verified operational baselines for each vehicle. Compare the actual atmosphere and experimental conditions; neither equal oxygen partial pressure nor a shared material name establishes equivalence.

A material can pass NASA-STD-6001 Test 1 (upward burn at 1g, 21% O2, Earth) and still sustain combustion in a spacecraft cabin at low flow. The simulator makes this visible for the vehicle the engineer is designing right now.

### 3.2 Fire envelope concept (static backdrop)

The "fire envelope" is a research concept: a region of conditions under which a defined sample sustains combustion. No envelope classifier has been trained. The existing mixed tables do not supply a universal supervised target; outcomes, units and experimental grain must be verified within a compatible family before any classifier is considered.

The MVP backdrop is an evidence-coverage view, not a probability-of-fire map. The dynamic foreground may be an illustrative scenario or measured experimental replay; calibrated prediction is a separate, gated capability.

### 3.3 Stochastic propagation model (Markov chain + Monte Carlo)

This section retains an **optional, unimplemented research design**, not the core delivery prerequisite. Useful quantitative targets must first be extracted and checked. The current procedural animation is illustrative and must not be described as a calibrated Markov/GP simulator. The authoritative mode/eligibility contract is in `docs/architecture/EVIDENCE_RETRIEVAL_AND_SCENARIO.md`.

#### 3.3.1 Discretization

Each vehicle interior is discretized into a cell grid. Target cell size is 10cm × 10cm on each surface. For Orion crew cabin (~30 m² of inner surfaces), this yields approximately 3000 cells.

Each cell carries:
- `cell_id`
- `surface_id` (parent surface in the vehicle template)
- `position_3d` (centroid in world coords)
- `normal_3d` (surface normal)
- `material_id`
- `neighbors_cell_ids` (4-connectivity on same surface, 3D-proximity across surface boundaries within a threshold distance)

#### 3.3.2 Cell states

Five states, ordered by progression:
0. `intact` — no ignition pressure
1. `heating` — adjacent cell is burning, heating up
2. `ignited` — threshold crossed, flame starting
3. `burning` — sustained combustion, releasing heat
4. `burned_out` — hypothetical fuel-consumption state; not inferred merely from loss of visible flame or termination of a CSV test

#### 3.3.3 Transition probabilities

Full derivation in `TECHNICAL_FOUNDATIONS.md` Part C. Summary for implementers:

- `intact → heating` uses the Alexandridis multiplicative form (independent exposure from each burning neighbor):
  `p = 1 - Π_j (1 - p_ij)`, with `p_ij = p_0 · g_mat · g_O2 · g_flow(direction) · g_geom`.
  - `g_mat` may use a verified oxygen limit only within its measured material, geometry, pressure and test regime; a 1g qualification limit is not a universal microgravity ignition cutoff.
  - `g_flow` must be conditioned on measured direction and regime. There is no universal downstream > upstream rule, universal hump shape or universal minimum-flow cutoff. A PMMA-rod observation cannot be transferred to every surface.
  - `p_0` is set per trajectory so expected front speed matches the GP-sampled spread rate: `p_eff ≈ V_f · Δt / h`.

- `heating → ignited` is a sigmoid in accumulated exposure: `1 / (1 + exp(-k (E_i - θ_mat)))`, with `θ_mat` fitted from ignition delay data.

- `ignited → burning`: deterministic after one step.

- `burning → burned_out`: geometric, `p = Δt / τ_burn(mat, O2, u)`.

Because exposure `E_i` depends on history, a Markov formulation would need that exposure and any relevant state age included in its full state. Do not call the five visual labels alone memoryless while simultaneously using accumulated heating. Sampling parameters and trajectories does not establish physical validity.

#### 3.3.3b Regime rules the model must reproduce

From microgravity measurements (TECHNICAL_FOUNDATIONS.md §B.3):
1. Validate low-flow extinction only for the specific measured sample/regime; do not enforce extinction for every material at zero ventilation.
2. Represent non-monotone flow dependence where observations support it; do not presume the same curve across geometries or directions.
3. Reproduce an oxygen crossover only in the matched PMMA-rod conditions studied; it is not a universal threshold for cabin materials.
4. Keep visible-flame extinction, cool-flame persistence, fuel consumption and test termination distinct.

These become qualitative validation tests (§13.3).

#### 3.3.4 Monte Carlo loop

For each scenario, the backend runs N = 200 independent trajectories. Each trajectory uses a different random seed. Parameters within each trajectory are also sampled from the posterior distributions of the calibration fits (spread_rate ± uncertainty, ignition_delay ± uncertainty, etc), so the ensemble reflects both stochastic transitions and parameter uncertainty.

Any cell count, trajectory count and runtime below is a design budget only; no backend benchmark has established latency. More stochastic trajectories reduce sampling noise, not model bias or missing-physics uncertainty.

#### 3.3.5 Aggregates reported

For each cell and each timestep:
- `p_burning(cell, t)` — probability the cell is in `burning` state at time t
- `p_ever_ignited(cell)` — probability the cell ever reached `ignited` during simulation

Global aggregates:
- `time_to_critical_distribution` — P5, P50, P95 of time until N% of cells are burning
- `time_to_detector_distribution` — same, for time until a smoke detector cell reaches threshold
- `propagation_reach` — expected final extent of burn footprint
- `critical_zone_breach_probability` — P(fire reaches a crew_seat, cable_run, or equipment_rack cell)

#### 3.3.6 Calibration data sources

| Parameter        | Primary source           | Secondary       | Coverage                         |
| ---------------- | ------------------------ | --------------- | -------------------------------- |
| spread_rate      | Matched Saffire/BASS measurements, if recovered | Reports/time series | No verified modeling-ready point count yet |
| ignition_delay   | Matched published measurements, if recovered | Relevant ReadMe/report | Availability not verified; BRE session counts are not solid ignition delays |
| burn_duration    | Explicit timed measurements, if recovered | Matched reports | Not guaranteed by the imported BASS-II summary CSV |
| detector response| SAME + SAME-R            | DAFT            | Relevant sources, not a validated cabin-response lookup |

GPs are one possible future surrogate, not a chosen/trained deliverable. Measured anchors require their exact experimental domain and extraction provenance. GP variance does not certify extrapolation coverage, especially for gravity, material or geometry absent from its inputs/training. Missing ground truth cannot be repaired by assigning a wider confidence band.

Stored as `data/processed/propagation_params.pkl` (fitted model with coefficient posteriors).

#### 3.3.7 Validation

Use an independently held-out, compatible family only after actual target measurements have been recovered. The nine imported Saffire-II sample rows are not automatically nine spread-rate labels. A numerical threshold must be justified for the chosen target; the previous blanket MAPE < 30% gate is withdrawn. If prediction is unavailable or fails, keep retrieval, measured evidence and clearly labeled illustrative 3D available. An unvalidated XGBoost model is not a safe fallback.

#### 3.3.8 What this is and is not

**Current:** interactive procedural 3D with a real experimental catalog and source links. **Planned:** hybrid evidence retrieval and cited synthesis. **Optional research:** a calibrated local surrogate/propagation model only after a target-specific eligibility and validation gate passes.

**Is not:** CFD, a validated probabilistic cabin predictor or a replacement for engineering-grade fire analysis. Illustrative scenario exploration and literature-backed interpretation are not certification.

This distinction must appear in the pitch and in the dashboard UI (a "Model Limitations" tooltip always visible).

Do not claim a validated performance/accuracy advantage over FDS or hundreds of experimentally supported cabin futures. A retrieved experimental finding, an illustrative scenario and a model prediction are different outputs and must be labeled and exported separately.

## 4. Data sources

### 4.1 NASA Physical Sciences Informatics (PSI)

Access/licensing: the selected PSI artifacts are publicly accessible; preserve their attribution and any item-level terms. Do not assign blanket CC0 status to every linked publication, image, video or third-party work without checking its terms.
DOI pattern: 10.60555/...
Portal: https://psi.nasa.gov

**Actual snapshot authority:** `docs/research/DATA_CONNECTION.md` and `public/data/nasa-provenance.json`. The following legacy research shortlist is not a verified schema/label inventory. The snapshot contains 24 metadata files, 22 CSVs and 2,001 heterogeneous records across 20 tabular projects; four selected projects have metadata only. Metadata, computational outputs and session summaries must not be counted as independent flight tests.

The selected investigation shortlist can be organized by potential role; actual recovered fields/grain override the old expectations below:

**Layer 1 — Structured lookup and comparison, not universal classifier labels:**

| PSI ID  | Investigation           | Platform                     | Imported records/metadata | DOI | Available fields / limits |
| ------- | ----------------------- | ---------------------------- | ----- | ------------------- | ---------------------------------------------------------------- |
| PSI-25  | BASS-II                 | ISS / MSG                    | 129 rows | 10.60555/4qc4-de67 | Material/O2 and raw fields; no explicit pressure, calibrated display-to-flow conversion or universal outcome |
| PSI-69  | FLEX                    | ISS / CIR / MDCA             | 274 rows | 10.60555/mbq8-0451 | O2 fraction and mmHg in original; %/kPa in snapshot; Test end not a universal outcome |
| PSI-159 | ACME CFI-G              | ISS / CIR                    | 333 rows | (TBD) | Normal/inverse tables; retain actual row grain and original fields |
| PSI-117 | Computational cool-flame study | Computational | metadata only | (TBD) | No experimental table listed in recovered metadata |
| PSI-115 | Smoke plume modeling | Computational/reference | metadata only | (TBD) | Not a table of 35 measured flight tests |
| PSI-99  | Saffire-II              | Cygnus (uncrewed, post-undock)| 9    | (TBD)               | same material burned in orbit and on ground, comparison          |

**Layer 2 — Potential quantitative sources after target extraction (Saffire series):**

| PSI ID  | Investigation       | Platform                      | Role in HabitatFire                                        |
| ------- | ------------------- | ----------------------------- | ---------------------------------------------------------- |
| PSI-98  | Saffire-I           | Cygnus (uncrewed)             | Large-sample spread rate measurement, calibration anchor   |
| PSI-99  | Saffire-II          | Cygnus (uncrewed)             | Orbit vs ground comparison, held out for validation        |
| PSI-100 | Saffire-III         | Cygnus (uncrewed)             | Additional materials, calibration                          |
| Saffire-IV/V/VI | (NTRS only)   | Cygnus (uncrewed)             | Additional materials and atmospheres (from NTRS reports)   |

**Layer 3 — Additional combustion families; some have imported CSVs, media remain separately linked:**

| PSI ID  | Investigation       | Platform                      | Notes                                              |
| ------- | ------------------- | ----------------------------- | -------------------------------------------------- |
| PSI-26  | BASS                | ISS / MSG                     | Historical baseline for spread rate                |
| PSI-68  | FLEX-2              | ISS / CIR                     | Caveat: ~2600 legacy files return 404              |
| PSI-10  | ACME Flame Design   | ISS / CIR                     | CIR + MDCA video                                   |
| PSI-20  | ACME BRE            | ISS / CIR                    | Burning Rate Emulator; gas-burner session/ignition-count summaries, not solid ignition delays |
| PSI-21  | ACME CLD            | ISS / CIR                     | Coflow laminar diffusion flames                    |
| PSI-22  | ACME E-FIELD Flames | ISS / CIR                     | Electric-field effects; not a general equivalence to partial gravity |
| PSI-23  | ACME s-Flame        | ISS / CIR                     | Flame structure                                    |
| PSI-39  | CFI                 | ISS / CIR / MDCA              | Cool flames investigation                          |
| PSI-106 | SLICE               | ISS / MSG                     | Structure & liftoff, gas                           |
| PSI-107 | SPICE               | ISS / MSG                     | Smoke point in co-flow                             |

**Layer 4 — Detection research and interpretation; calibration requires measured response targets:**

| PSI ID  | Investigation | Platform | Notes                                              |
| ------- | ------------- | -------- | -------------------------------------------------- |
| PSI-102 | SAME          | ISS      | Smoke detection instrument in microgravity         |
| PSI-101 | SAME-R        | ISS      | Reflight of SAME                                   |
| PSI-47  | DAFT/DAFT-2   | ISS      | Same instrument for dust, cited in challenge       |

**Layer 5 — Modeling / ground investigations (cite only):**
PSI-62 (DesJardin flame spread), PSI-60, PSI-142. Use PSI data as inputs to simulation, not as new measurements, but useful references.

### 4.2 NASA Technical Reports Server (NTRS)

Portal: https://ntrs.nasa.gov

Must-have PDFs for RAG indexing and for propagation calibration (seed list, pre-hackathon):
- NASA/TP-2015-216046 (FLEX column documentation, Appendix A.1 and Table IX)
- NTRS 20210011385 (BASS-II Summary Report, reports burn times)
- NTRS 20170001636 (Saffire Objectives, Development and Status)
- Saffire I-VI final papers (spread rate tables, our calibration source)
- ACME overview, SoFIE context, SAME summary, DAFT summary
- Start with a small verified corpus of PSI descriptions/ReadMes, relevant report sections and the official NASA guide; expand only when it improves a concrete query. No document-count quota or unverified pre-event-work exemption.

### 4.3 Standards

NASA-STD-6001 is a relevant qualification reference. Verify the revision/change and exact section on the official standards page before citing a requirement; do not describe the old document's unverified revision as current. Qualification at one atmosphere/geometry is not a cabin safety certification.

Portal: https://standards.nasa.gov/standard/nasa/nasa-std-6001

### 4.4 Material library (optional curated extension, not implemented)

Start with materials needed by the demo rather than a quota. Distinguish hypothetical scene assignments from verified vehicle inventories. Each supported entry may map to:
- Investigations that tested it (PSI test_ids)
- Measured rates/delays/durations with geometry, units and conditions only if recovered
- A qualification result only at its exact tested atmosphere and configuration, not a universal pass/fail property
- Typical use case (crew textile, structural panel, cable insulation, display housing)

Stored as `data/materials_library.json`.

### 4.5 Known data pitfalls

1. Legacy missing-file reports are not a fresh availability audit. Do not infer a dataset's present completeness from an old count of broken links.
2. PSI-117 is a computational cool-flame study in the recovered metadata, not a second FLEX test table. Use accession IDs and the actual metadata, not legacy names.
3. The recovered BASS-II CSV has 17 columns; its fan/air display values are not calibrated cm/s.
4. Missing values, interval/list strings and ambiguous units remain explicit; do not create a complete feature matrix by inventing physical defaults.
5. Partial-gravity coverage is not established in our snapshot. Recheck actual new data before claiming coverage; surface-context retrieval is useful without a validated surface prediction.
6. Rocket/propellant combustion is out of scope by NASA mandate.
7. Saffire sample geometries are flat panels, not 3D cabin geometry. Our Markov cell adjacency is a geometric abstraction and must be labeled as such.
8. SAME-R is named in the challenge brief and listed in PSI (PSI-101), but no standalone NTRS report was located. Cite it via PSI only.
9. Current vehicle-specific atmosphere tables for Orion, Dragon and Starliner were not found in NASA primary sources. Presets use the ISS specification (NTRS 20120015343) and the historical Orion 10.2 psia exploration point (NTRS 20130011191), labeled as such.
10. PMMA spread rates in mm/s from Zhao et al. (2017) live in supplementary tables; extract them pre-hackathon or treat 0.1 to 2 mm/s as a wide prior only.

## 5. System architecture

### 5.1 High level — current slice and proposed extension

```
CURRENT
React + TypeScript + Vite (src/)
    ├── React Three Fiber / drei: module, surface and material selection
    ├── Experiment explorer and illustrative fire timeline
    └── Local normalized JSON + untouched CSV/metadata + provenance

PROPOSED, NOT IMPLEMENTED
Question + selected structure/material + visible atmosphere + safety intent
    └── Thin backend: validated query context
          ├── Exact/lexical and multilingual dense retrieval
          ├── Structured experimental-condition lookup
          ├── Rank fusion + applicability checks + investigation grouping
          └── Cited synthesis: findings, differences, gaps and data export
                    └── Scenario eligibility gate
                          ├── Illustrative 3D (assumptions explicit)
                          ├── Experimental replay (measured timestamps only)
                          └── Calibrated prediction (optional, target-specific)
```

### 5.2 Deployment

Current dev/demo: the existing npm/Vite app and local snapshot. Do not migrate to Next.js, a monorepo or containers solely for this design update. A thin backend is proposed for retrieval and server-side LLM credentials; provider, hosting and paid services require a later implementation decision.

For the small initial corpus, cached embeddings plus an in-process exact vector/lexical search are sufficient design candidates. Qdrant is an optional storage/query adapter, not mandatory infrastructure. Evidence browsing and illustrative 3D must remain available if an LLM/retriever is unavailable; show a real degraded state rather than fake live answers.

### 5.3 Monorepo layout

**Historical v1.3 sketch, not the repository layout or a migration task.** The implementation root currently contains `src/`, `scripts/sync_nasa.py`, `data/raw/psi/` and `public/data/`. Paths below are research placeholders, not existing files. Proposed logical data/retrieval boundaries are specified in `docs/architecture/EVIDENCE_RETRIEVAL_AND_SCENARIO.md` without prescribing a rewrite.

```
habitatfire/
├── apps/
│   ├── web/                      Next.js frontend
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── canvas-3d/        R3F scene + cell overlay
│   │   │   ├── control-panel/
│   │   │   ├── agent-cards/
│   │   │   └── timeline-scrubber/
│   │   ├── lib/
│   │   │   ├── vehicles/         vehicle templates (geometry + surfaces)
│   │   │   └── simulation/       client-side state for sim playback
│   │   ├── public/models/
│   │   └── package.json
│   └── api/                      FastAPI backend
│       ├── habitatfire_api/
│       │   ├── main.py
│       │   ├── state.py
│       │   ├── agents/
│       │   ├── propagation/
│       │   │   ├── discretize.py
│       │   │   ├── calibrate.py
│       │   │   └── markov.py
│       │   ├── tools/
│       │   ├── models/
│       │   └── rag/
│       ├── tests/
│       └── pyproject.toml
├── packages/
│   └── schemas/                  Shared TypeScript types mirroring Pydantic
├── data/
│   ├── raw/                      PSI downloads, gitignored
│   ├── processed/
│   │   ├── unified.parquet       ~675 rows
│   │   ├── fire_envelope.pkl     XGBoost model
│   │   └── propagation_params.pkl Markov calibration
│   ├── materials_library.json
│   ├── vehicle_discretizations/  cell grids per template, JSON
│   └── sources/
│       ├── pdfs/
│       └── metadata.jsonl
├── notebooks/
│   ├── 01_eda.ipynb
│   ├── 02_unify_schema.ipynb
│   ├── 03_train_envelope.ipynb
│   ├── 04_calibrate_propagation.ipynb   NEW
│   └── 05_validate_saffire_ii.ipynb     NEW
├── scripts/
│   ├── download_psi.py
│   ├── ingest_rag.py
│   ├── build_materials_lib.py
│   ├── calibrate_propagation.py         NEW
│   └── validate_propagation.py          NEW
├── docker-compose.yml
├── turbo.json
├── package.json
├── PROJECT.md                    this file
└── README.md
```

## 6. Historical backend research sketches — not current contracts

The following v1.3 examples are retained as optional design history. No `apps/api` backend, four-agent DAG, risk-scoring API, GP/CA model or `/simulate` service is implemented. Mandatory numeric fields in these examples do not authorize fabricated values: the evidence-first MVP uses the retrieval/scenario contract in the architecture document and must omit unavailable physical estimates. Do not implement these sketches before the core evidence journey or interpret their sample model names as verified provider offerings.

### 6.1 Scenario State (Pydantic)

File: `apps/api/habitatfire_api/state.py`

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum

class VehicleTemplate(str, Enum):
    ORION_CREW_CABIN = "orion_crew_cabin"      # spacecraft in transit (default)
    ISS_US_LAB_MODULE = "iss_us_lab_module"    # orbital station module
    SURFACE_HABITAT_LTV = "surface_habitat_ltv"  # extrapolation mode

class MissionProfile(str, Enum):
    TRANSIT = "transit"
    ORBITAL = "orbital"
    SURFACE = "surface"

class SurfaceKind(str, Enum):
    WALL = "wall"
    FLOOR = "floor"
    CEILING = "ceiling"
    FURNITURE = "furniture"
    EQUIPMENT_RACK = "equipment_rack"
    WINDOW = "window"
    CREW_SEAT = "crew_seat"
    CABLE_RUN = "cable_run"

class SurfaceAssignment(BaseModel):
    surface_id: str
    kind: SurfaceKind
    material_id: str

class Atmosphere(BaseModel):
    o2_pct: float = Field(ge=15, le=100)
    pressure_psi: float = Field(ge=4, le=16)
    flow_cm_s: float = Field(ge=0, le=100)          # ISS nominal 5 to 20 cm/s
    flow_direction: tuple[float, float, float] = (1.0, 0.0, 0.0)  # unit vector in vehicle frame, drives opposed vs concurrent spread
    diluent: Literal["N2", "He", "CO2", "mix"] = "N2"
    gravity_g: float = Field(ge=0.0, le=1.0)
    temperature_c: float = Field(default=22.0, ge=10, le=40)        # ISS spec 17.8 to 26.7
    relative_humidity_pct: float = Field(default=45.0, ge=0, le=100) # ISS spec 25 to 70

class IgnitionSource(str, Enum):
    ELECTRICAL_OVERHEAT = "electrical_overheat"   # wiring or display fault, low initial heat
    LI_ION_BATTERY = "li_ion_battery"             # thermal runaway, ~23.6 kW peak (NTRS 20260001600)
    HOT_WIRE = "hot_wire"                         # Saffire-style igniter, calibration reference

class IgnitionPoint(BaseModel):
    surface_id: str
    cell_id: Optional[str] = None   # if known; otherwise computed from x,y
    x: float                         # local coords, 0-1
    y: float
    source: IgnitionSource = IgnitionSource.ELECTRICAL_OVERHEAT

class Scenario(BaseModel):
    vehicle: VehicleTemplate
    mission_profile: MissionProfile
    surfaces: list[SurfaceAssignment]
    atmosphere: Atmosphere
    ignition: IgnitionPoint   # now required for simulation
    simulation_duration_s: float = 90.0
    n_trajectories: int = 200
    timestep_s: float = 0.5
```

### 6.2 Simulation types (Pydantic)

File: `apps/api/habitatfire_api/models/simulation.py`

```python
class CellProbability(BaseModel):
    cell_id: str
    p_burning: float          # probability cell is in burning state at this timestep
    p_ever_ignited: float     # cumulative probability cell has ignited by this timestep

class FrameSnapshot(BaseModel):
    t_seconds: float
    cells: list[CellProbability]

class TrajectoryStat(BaseModel):
    p5: float
    p50: float
    p95: float

class PropagationResult(BaseModel):
    scenario: Scenario
    n_trajectories: int
    timestep_s: float
    duration_s: float
    frames: list[FrameSnapshot]              # one per timestep, ~180 frames for 90s/0.5s
    time_to_detector_s: TrajectoryStat       # across trajectories
    time_to_critical_s: TrajectoryStat
    propagation_reach_m2: TrajectoryStat
    critical_zone_breach_prob: dict[str, float]  # keyed by critical surface_id (crew_seat, cable_run, etc)
    extrapolation_mode: bool
    calibration_validation_passed: bool      # true if Saffire-II validation passed
    narrative_summary: str                    # short machine-generated summary for agents to consume
```

### 6.3 Agent outputs (Pydantic)

File: `apps/api/habitatfire_api/models/agent_outputs.py`

```python
class Evidence(BaseModel):
    source_id: str
    reference: str
    url: str
    quote: Optional[str] = None

class DetectionExpertOutput(BaseModel):
    probability_of_detection: float         # fraction of trajectories where the detector alarms at all
    time_to_alarm_s: TrajectoryStat         # over trajectories that did alarm
    time_to_critical_s: TrajectoryStat
    detector_type: str                      # ISS: forward-scatter IR, in return vent (NTRS 20070031686)
    particle_size_mismatch: bool            # true when material smoke is mostly below the 1 µm sensitivity peak (e.g. Kapton, Teflon)
    filtration_race_risk: bool              # true when ECLSS filtration may remove smoke faster than it accumulates
    confidence_note: str
    saffire_analog: Optional[Evidence] = None
    narrative: str
    evidence: list[Evidence]

class MaterialAnalog(BaseModel):
    material_id: str
    similarity: float
    outcome_in_test: Literal["burn", "self-extinguish", "mixed"]
    conditions_tested: dict
    evidence: list[Evidence]

class MaterialAdvisorOutput(BaseModel):
    surface_id: str
    material_id: str
    flammability_score: float
    ignition_probability: float    # from simulation
    analogs: list[MaterialAnalog]
    knowledge_gap: bool
    narrative: str
    evidence: list[Evidence]

class EnvelopePosition(BaseModel):
    o2_pct: float
    pressure_psi: float
    predicted_outcome: Literal["burn", "self-extinguish", "unknown"]
    confidence: float
    in_tested_domain: bool

class AtmosphereAnalystOutput(BaseModel):
    envelope_position: EnvelopePosition
    nearest_tests: list[Evidence]
    enrichment_factor: float
    fraction_trajectories_sustained: float   # out of n_trajectories, how many sustained combustion
    extrapolation_warning: Optional[str] = None
    narrative: str
    evidence: list[Evidence]

class SuppressionOption(BaseModel):
    method: Literal["fine_water_mist_pulsed", "ventilation_shutdown", "co2_legacy"]
    effectiveness_score: float
    deploy_time_s: float            # when agent would be deployed
    containment_probability: float   # P(contains fire if deployed at deploy_time_s), from simulation
    engagement_radius_m: Optional[float] = None   # 1.2 m operational max for ISS water mist PFE (NTRS 20180005251)
    constraints: list[str]           # e.g. "CO2 ineffective on Li-ion", "ventilation shutdown also blinds the detector"
    evidence: list[Evidence]

# Historical sketch only: no unconditional operational suppression ranking.
# Evidence applicability and measured agent/source conditions must be checked first.

class SuppressionExpertOutput(BaseModel):
    options: list[SuppressionOption]
    recommended: str
    narrative: str
    evidence: list[Evidence]

class AssessmentPayload(BaseModel):
    scenario: Scenario
    propagation: PropagationResult           # NEW, central to v1.2
    detection_expert: DetectionExpertOutput
    material_advisor: list[MaterialAdvisorOutput]
    atmosphere_analyst: AtmosphereAnalystOutput
    suppression_expert: SuppressionExpertOutput
    overall_risk_score: float
    overall_risk_band: Literal["low", "moderate", "high", "critical"]
    knowledge_gaps: list[str]
    extrapolation_mode: bool
    sources_used: list[Evidence]
```

### 6.4 Propagation module

File: `apps/api/habitatfire_api/propagation/`

#### 6.4.1 `discretize.py`

```python
def discretize_vehicle(template: VehicleTemplate, cell_size_m: float = 0.1) -> CellGrid
```

Takes a vehicle template (surfaces as geometric primitives) and generates a flat list of cells with positions, normals, material slots, and neighbor lists. Output cached per template in `data/vehicle_discretizations/{template_id}.json`.

Neighbor computation:
- Same-surface neighbors: 4-connectivity on cell grid
- Cross-surface neighbors: cells within Euclidean distance < threshold (default 15cm) on adjacent surfaces

Pre-computed once per template during setup. Loaded at request time.

#### 6.4.2 `calibrate.py`

```python
def calibrate_propagation_params(
    saffire_data: pd.DataFrame,
    bass_data: pd.DataFrame,
    acme_bre_data: pd.DataFrame,
) -> PropagationParams
```

Fits three regression models (with uncertainty):
- `spread_rate(material, o2_pct, flow_cm_s) -> mm/s + std`
- `ignition_delay(material, o2_pct) -> s + std`
- `burn_duration(material, o2_pct, flow_cm_s) -> s + std`

Uses scikit-learn `GaussianProcessRegressor` or Bayesian ridge for uncertainty quantification. Saved to `data/processed/propagation_params.pkl`.

Called once at setup, not at request time.

#### 6.4.3 `markov.py`

```python
def simulate(
    scenario: Scenario,
    cell_grid: CellGrid,
    params: PropagationParams,
    n_trajectories: int = 200,
    duration_s: float = 90.0,
    timestep_s: float = 0.5,
) -> PropagationResult
```

Monte Carlo loop:
```python
for trajectory_idx in range(n_trajectories):
    # sample parameter values from posterior
    sampled_params = params.sample(seed=trajectory_idx)
    # initialize state array (N_cells,) of ints 0..4
    state = np.zeros(n_cells, dtype=np.int8)
    state[ignition_cell_idx] = 2  # ignited
    # time loop
    for t in timesteps:
        state = step(state, cell_grid, sampled_params, atmosphere, timestep_s, rng)
        record(trajectory_idx, t, state)

# aggregate across trajectories
p_burning_per_cell_per_t = compute_marginals(trajectories)
time_to_critical = compute_time_percentiles(trajectories, threshold_fn=critical_fn)
```

`step()` is fully vectorized: for each cell, compute transition probabilities to each possible next state, sample uniformly, update.

Target performance: 3 to 8 seconds per `/simulate` call for 3000 cells × 200 trajectories × 180 timesteps on CPU (numpy). If too slow, port hot loop to Numba or numpy with precomputed neighbor masks.

### 6.5 LangGraph DAG

File: `apps/api/habitatfire_api/agents/graph.py`

Optional pre-graph for natural language input (only when the user types a scenario instead of using controls):

0a. `scenario_parser` (LLM, Haiku, temperature 0): reads the user text, calls `list_surfaces(vehicle)`, `search_material_by_description(text)` and `list_presets()`, emits a Scenario via structured output. Fills only what the user mentioned; everything else comes from the vehicle template defaults.
0b. `schema_validator` (Pydantic): on ValidationError, retry the parser with the error appended, max 3 times.
0c. `physics_validator` (pure Python): O2 within OCHMO bounds for the pressure, diluent ≥ 30 %, ignition surface exists on the vehicle, Li-ion source only on `equipment_rack` or `console` surfaces.
0d. **Confirmation**: the parsed Scenario is returned to the frontend as an editable diff. Simulation runs only after the user clicks Run. The parser never triggers a simulation by itself.

Main graph:
1. `scenario_in` (entry): validates input Scenario, flags extrapolation_mode
2. `simulate`: runs propagation Markov Monte Carlo, returns PropagationResult, cached in state
3. `material_advisor`: runs once per surface in parallel, consumes simulation p_ever_ignited per cell
4. `atmosphere_analyst`: independent of simulation, uses XGBoost envelope classifier
5. `detection_expert`: consumes simulation time_to_detector_s distribution
6. `suppression_expert`: consumes simulation + queries "if I deploy CO2 at t_X, what fraction of trajectories would be contained?"
7. `integrator`: merges outputs in Detection-first order, returns AssessmentPayload

Edges:
```
scenario_in → simulate
simulate → material_advisor (fan-out one per surface)
simulate → atmosphere_analyst
simulate, material_advisor*, atmosphere_analyst → detection_expert
all above → suppression_expert
all → integrator → END
```

Each agent is a LangGraph node with a tool-using LLM (Claude Haiku via Anthropic SDK). The simulate node is **not** an LLM call, it is a pure Python function wrapped as a node.

### 6.6 Tools

File: `apps/api/habitatfire_api/tools/`

#### 6.6.1 `search_literature(query: str, filters: dict | None) -> list[Chunk]`

Qdrant search with optional metadata filters (investigation_id, fuel_phase, o2_range, pressure_range, topic, platform).

#### 6.6.2 `query_experiments(sql | params) -> list[dict]`

DuckDB query against unified.parquet.

#### 6.6.3 `predict_flammability(features: dict) -> dict`

XGBoost static envelope classifier. Returns `{probability_burn, confidence, in_tested_domain, nearest_test_ids}`. Used by Atmosphere Analyst.

#### 6.6.4 `query_simulation(propagation_result, question_type, params) -> dict`

Agents call this to ask the completed PropagationResult specific questions:
- `question_type="when_does_cell_x_burn"`
- `question_type="fraction_trajectories_sustained"`
- `question_type="containment_if_suppression_at_t"` (replays trajectories with suppression at t, uses analytical shortcut: assume suppression halts spread probabilistically after t)
- `question_type="critical_zone_breach"`

Returns structured answer plus pointers to evidence.

#### 6.6.5 `match_materials(user_material_id: str, scenario: dict) -> list[dict]`

Nearest neighbors in unified experiments table by material + conditions.

### 6.7 Unified schema

File: `data/processed/unified.parquet`, built by `scripts/build_unified.py`.

```
investigation_id   str
test_id            str
platform           str    ISS_CIR | ISS_MSG | ISS_Cabin | Cygnus | Ground
fuel               str
fuel_phase         str    solid | liquid | gas
o2_pct             float
pressure_psi       float
flow_cm_s          float
diluent            str
gravity_g          float
outcome            str    burn | self-extinguish | mixed | unknown
outcome_detail     str
sample_shape       str
sample_size_mm     float
burning_rate_mm2_s float
spread_rate_mm_s   float  NEW, extracted from Saffire papers
ignition_delay_s   float  NEW
burn_duration_s    float  NEW
source_file        str
source_url         str
```

### 6.8 API endpoints

File: `apps/api/habitatfire_api/main.py`

```
GET  /health
GET  /vehicles                           list of templates + default profile
GET  /vehicles/{id}/cell_grid            pre-computed cell grid for the template
GET  /materials                          materials library
GET  /sources                            aggregated sources
GET  /presets/atmospheres                presets
POST /parse                              body: {text, current_scenario?}, returns {scenario, diff, warnings} (no simulation)
POST /simulate                           body: Scenario, returns PropagationResult
POST /assess                             body: Scenario, returns AssessmentPayload (runs simulate internally)
POST /chat/message                       body: {scenario, propagation, message, history}, SSE stream
GET  /experiments?filters                DuckDB query, debug
```

CORS enabled for `localhost:3000` in dev.

### 6.9 LLM config

Provider/model: not selected in this design. Verify actual available model IDs and credentials when implementation is authorized. No hardcoded provider model name from the v1.3 sketch is an implementation dependency.
Temperature: 0.2 for agents, 0.5 for chat.
Max tokens per agent call: 1500.
System prompt template: `apps/api/habitatfire_api/agents/prompts/*.md`, one per agent.

Each agent prompt must include:
- Role
- Available tools
- Strict rule: every factual claim backed by evidence
- Strict rule: when extrapolation_mode, narrative must call this out and cite the absence of PSI coverage
- Rule: when consuming PropagationResult, always report percentile ranges (P5, P50, P95) not point estimates
- Output format (Pydantic model) with example

## 7. Frontend specification

**Current product direction:** keep the working React/Vite/Three.js experience. A selected surface supplies explicit context to evidence search. The main result panel must prioritize ranked investigations, comparable records, cited findings, prevention/detection/suppression relevance, terrestrial connections and gaps. The older four-agent/quantitative layout below is an optional concept, not required UI. Risk scores, percentile bars and physical timelines remain unavailable unless independently supported; an illustrative timeline stays usable without them.

### 7.1 Routes

- `/` landing page with Artemis II opening, explainer of the Markov simulation approach
- `/design` main dashboard

### 7.2 Dashboard layout (`/design`)

Four-pane layout (change from v1.1 to accommodate timeline scrubber):

**Left pane (22%):** Control Panel
- Natural language box at the top ("Describe a scenario, e.g. Li-ion fire on the Orion console at exploration atmosphere"). Submitting calls `POST /parse` and highlights the controls that changed. The user reviews, then clicks Run.
- Vehicle template picker
- Mission profile pill
- Atmosphere sliders + preset chips
- Gravity toggle (extrapolation badge for non-0g non-1g)
- Surface list with material assignment
- Ignition point: click on 3D canvas to set, or dropdown to pick a known problem cell
- "Run simulation" button (triggers POST /assess)

**Center pane (46%):** 3D Canvas + Timeline Scrubber
- React Three Fiber scene
- Vehicle template geometry rendered as primitives
- Cell grid overlay: each cell colored by `p_burning(cell, t_current)` at the currently scrubbed time
- Transparency reflects uncertainty: fully opaque where P > 0.8, translucent where 0.2 < P < 0.8, invisible where P < 0.2
- Ignition point marker (small red sphere, pulses)
- Smoke particles at ignition for aesthetic context
- Timeline scrubber below canvas: horizontal bar from 0s to duration_s, with playhead
- Play/pause button, speed control (0.5x, 1x, 2x, 4x)
- Timeline markers: detector alarm (P50), critical threshold (P50)
- Current time display in corner

**Right pane (32%):** Agent Cards + Chat
- Four cards in Detection-first order (all collapsible):
  1. **Detection Expert**: timeline bar showing P5/P50/P95 of alarm time, Saffire analog
  2. **Material Advisor**: one subcard per surface, with per-surface ignition probability from simulation
  3. **Atmosphere Analyst**: envelope scatter + fraction of trajectories that sustained
  4. **Suppression Expert**: ranked options with containment probabilities at different deploy times
- Overall risk score at top (0-100 band + color)
- Model Limitations tooltip always visible: "Markov chain calibrated on Saffire + BASS-II. Not CFD. Advisory for design review."
- Extrapolation banner when applicable
- Each claim with `[PSI-25 #47]` chip
- Chat panel at bottom (SSE streaming)

### 7.3 3D vehicle templates

Three templates in `apps/web/lib/vehicles/*.ts`:

#### orion_crew_cabin (default)

Conical-frustum illustrative cabin, four-seat configuration. The 15 m³ Test 7 calculation reference is not an audited usable Orion volume and must not silently determine model geometry or concentration calculations. Detector placement is illustrative unless a vehicle-specific installation is verified; relevant return-vent research is not a complete Orion equipment map.
Default mission_profile: TRANSIT. Default atmosphere: Earth cabin. Default gravity_g: 0.0.

Surfaces: wall_fwd, wall_aft_port, wall_aft_stbd, floor_center, ceiling, crew_seat_1..4, console_main, cable_run_port, cable_run_stbd.

Target cell count after discretization: ~3000.

#### iss_us_lab_module

Cylinder 4.3m × 8.5m with rack bays.
Default mission_profile: ORBITAL. Default atmosphere: Earth cabin. Default gravity_g: 0.0.

Surfaces: rack_port_1..4, rack_stbd_1..4, rack_overhead_1..4, rack_deck_1..4, window_destiny, cable_tray.

Target cell count: ~4500.

#### surface_habitat_ltv (extrapolation mode)

Pressurized rover composite, ~6 m³, 2-crew.
Default mission_profile: SURFACE. Default atmosphere: Moon Base preset. Default gravity_g: 0.16.
UI badge: "Outside the measured domain of this snapshot. Transfer to partial gravity is not validated; zero-gravity results are not a guaranteed upper bound."

Surfaces: wall_front/back/left/right, floor, ceiling, seat_pair, console, airlock_hatch.

Target cell count: ~2000.

Each template exports (TypeScript):
```typescript
type VehicleTemplate = {
  id: string
  name: string
  description: string
  default_mission_profile: 'transit' | 'orbital' | 'surface'
  default_atmosphere: Atmosphere
  default_gravity_g: number
  volume_m3: number
  surfaces: SurfaceSpec[]
  detector_positions: DetectorSpec[]
  critical_zones: CriticalZoneSpec[]   // for breach probability
}
```

### 7.4 Cell grid rendering

Backend precomputes cell grid per template (JSON, 3000-4500 cells). Frontend loads once via `GET /vehicles/{id}/cell_grid`.

Each cell is rendered as a small `InstancedMesh` quad in React Three Fiber (instanced for performance; 4500 cells at 60 fps is viable on modern hardware).

On simulation result arrival (PropagationResult), frontend stores all `FrameSnapshot`s. Timeline scrubber updates the current frame index, triggering instance color updates.

Color mapping:
- state intact: material base color (gray tones)
- p_burning in [0, 0.2]: base color
- p_burning in [0.2, 0.5]: yellow blend
- p_burning in [0.5, 0.8]: orange blend
- p_burning in [0.8, 1.0]: red
- p_ever_ignited == true and current state != burning: dark red (scorched)

### 7.5 UI library

- shadcn/ui (New York, Zinc)
- Tailwind CSS 4
- lucide-react
- recharts (envelope plot, timeline bars)
- react-three-fiber + @react-three/drei
- @tanstack/react-query
- eventsource-parser (SSE)
- zustand (client-side simulation playback state)

### 7.6 Design system

Typography: Geist Sans (UI), Geist Mono (data).
Color base: dark default.
Spacing: 4px base.
Border radius: md (0.375rem).
Shadows: subtle.

## 8. RAG pipeline

### 8.1 Three linked evidence layers, not one bag of text

1. **Investigation discovery:** objectives, approach, platform, measured/computational status, phase, topics and linked sources.
2. **Record comparison:** exact CSV-derived records with units, experimental grain, source row and applicability/missing-field notes. Do numeric comparisons through validated structured lookup, not vector arithmetic or an LLM's memory.
3. **Scientific interpretation:** section-aware chunks from accessible ReadMes, NASA reports/guides and publications, retaining page/section/figure and linking to investigation/record only when the relationship is supported.

Images/videos initially remain linked evidence with captions and verified sample associations. Time-series/frames are replayable only when actually retrieved with a measured timebase. No unimplemented multimodal ingestion is implied.

### 8.2 Context-aware hybrid retrieval

Query context comprises the user's question and intent (prevention, detection, suppression, post-fire or terrestrial transfer), module, selected surface/structure, assigned material, geometry if known, atmosphere and flow/gravity conditions. The module is spatial context, not proof an experiment occurred on that vehicle.

Use dense multilingual semantic retrieval for concepts and Portuguese/English queries; exact/lexical retrieval for PSI IDs, material names, acronyms and units; and deterministic structured comparison for numerical conditions. Combine candidate rankings with rank fusion, group by investigation and explain each result's relevance and incompatibilities. Retrieval score is not fire probability, scientific confidence or physical compatibility.

Apply hard filters only to explicit restrictions and known incompatibilities relevant to the task. Missing pressure/flow/geometry stays unknown, not zero and not an automatic exclusion. Keep direct evidence, analogs and background sources visibly separate. Exact experiment conditions may be shown as a supported subset; do not silently overwrite the rest of the scenario or attribute inherited values to that experiment.

### 8.3 Embedding/index baseline

Start with a pretrained multilingual model; no fine-tuning prerequisite. `intfloat/multilingual-e5-base` is a candidate, not an evaluated winner. Its model card specifies query/passage prefixes and a 512-token input limit; chunk within that budget, including title/context metadata. Cache embeddings with model revision, dimensionality, normalization, chunker version and source hash; re-index on a change rather than mixing incompatible vectors.

For the first curated corpus, an in-process exact vector/lexical index is an adequate candidate architecture; use Qdrant when its filtering/persistence serves the implementation. Do not add a vector database merely for 24 investigation summaries. A reranker is optional after inspecting real retrieval failures. Primary technical references are listed in the companion architecture document.

### 8.4 Answer and visualization handoff

The answer contains ranked investigations, linked records, cited findings, modeling-ready fields, mismatches/unknowns, and research relevance to safety controls/equipment. Include terrestrial applications when supported. A single evidence-synthesis flow is the MVP default; four specialized agents are optional.

The retriever hands an evidence bundle to a **deterministic scenario-eligibility gate**, not directly to a flame generator. Similar text does not authorize physical parameters. The gate chooses illustrative mode, eligible observed replay, or an explicitly validated predictive capability; unsupported physical values remain unavailable. Full boundaries and acceptance examples: `docs/architecture/EVIDENCE_RETRIEVAL_AND_SCENARIO.md`.

## 9. Predictive and simulation models

### 9.1 Three fidelity modes

- **Illustrative scenario:** representative flame/particle behavior responds to selected structure, material assignment and controls, using disclosed qualitative rules and assumptions. It is not evidence of predicted burn extent, temperature, alarm time or containment.
- **Experimental replay:** actual measured sequence/curve/video with its source sample, conditions, measured timebase and scale. A summary row without timing is not a replay; projecting a measured specimen onto a different cabin remains an illustrative transfer, not cabin validation.
- **Calibrated prediction:** optional future numerical model for a defined target and compatible material/geometry/domain. Requires recovered observations, reproducible calibration, independent validation, model/version provenance and an applicability check. A match in an embedding space cannot unlock this mode.

### 9.2 Target-specific eligibility

Check phase, material/composition, specimen geometry/scale, atmosphere/diluent, gravity, flow magnitude/direction and ignition/heating method wherever relevant to the target. Separate categorical incompatibility from unknown metadata. The evidence page may still show an incompatible analog, but it must not feed calibrated parameters unnoticed.

No global burn/non-burn classifier across the 2,001 heterogeneous rows. No inferred BRE solid ignition delays. No calibrated BASS airflow from uncalibrated display values. No material-only transfer of a rod burn rate to a wall panel. No lunar-gravity interpolation from a zero-gravity embedding match.

### 9.3 Validation proportional to the claim

Only a predictive capability needs numerical validation. Use a small compatible dataset with a held-out sample/group that avoids leakage and metric/tolerance chosen for the target. Failure means that prediction is unavailable, not that source discovery or illustrative 3D is disabled. Missing targets are a data gap, not a reason to synthesize labels or launch a large model-search campaign.

### 9.4 Output provenance

Keep source observations, extracted/derived quantities, model predictions and illustrative assumptions in separate fields. A calibrated result includes model/version, target/unit, valid domain, contributing evidence IDs and the actual validation result. Do not use retrieval similarity, Monte Carlo frequency or GP variance as a calibrated probability of cabin safety.

## 10. Evidence and citation

### 10.1 Rule

Every factual claim in agent narrative, card content, or chat response must carry at least one Evidence entry. No "AI generated knowledge" statements allowed.

Observation-derived claims must cite a file/record or report page. A model-derived number additionally needs an actual model/version, target-specific validation and applicability result. Illustrative scenarios export their rules/assumptions, not invented physical estimates or fabricated test IDs. Do not present synthetic example alarm times as measured results.

### 10.2 Evidence sources

- PSI: `source_id = "PSI-XX"`, `reference = "test_<id>"` or ReadMe section, `url = investigation URL`
- NTRS: `source_id = "NTRS-XXXXXXX"`, `reference = "page N"` or section, `url = NTRS citation URL`
- Standards: `source_id = "NASA-STD-6001B"`, `reference = section`
- Material library: `source_id = "MATLIB-<material_id>"`
- Simulation: `source_id = "HF-SIM"`, `reference = "trajectories=200, seed=X, calibration=<params_hash>"`

### 10.3 Sources page

Automatic aggregation at `/sources`.

### 10.4 README citation block

Final README.md must include "Data and Resources" section listing every PSI investigation, NTRS paper, standard, library, and model used.

## 11. Delivery sequence — supersedes the dated v1.3 schedule

The ordered milestones below replace the old day-by-day schedule. They do not prescribe current assignments, required infrastructure, event-rule permissions or a mandate to implement unvalidated models.

1. **Evidence journey:** module/surface selection + question + intent returns ranked investigations, relevant records and cited findings with differences/gaps.
2. **Usable data:** inspect/export comparable fields with units and source rows; distinguish measured/derived/unknown values; support prevention/detection/suppression/equipment research and terrestrial relevance.
3. **Representative scenario:** keep the polished interactive 3D and connect it to the chosen evidence bundle; disclose assumptions, applied vs inherited conditions, experimental geometry and fidelity.
4. **Optional replay:** add only a verified timed experimental sequence that directly supports a demo question.
5. **Optional prediction:** one narrow validated target if measurements/time permit. No four-agent, three-template or general fire-model prerequisite.

Budget verification to essential checks of source integrity, evidence relevance, abstention and one real user journey. Do not spend the core hackathon effort on a broad testing framework or trying repeatedly to force a predictive model to pass.

### 11.1 Parallel work boundaries

- Evidence/data: curate the sources needed for demo questions and retain units/grain/provenance.
- Retrieval/synthesis: context contract, hybrid ranking, applicability explanations and grounded answers.
- Frontend/3D: contextual evidence panel, representative scenarios, source inspection and clear fidelity states.
- Integration/narrative: one working journey, degradation/unknown cases, usable export and actual submission guidance.

These are responsibilities, not assumed staffing or a commitment to a six-person team. No work permission before the event is inferred; follow the official participation rules.

## 12. Setup — use the existing repository

The greenfield Next.js/monorepo/container bootstrap from v1.3 is withdrawn. Do not create a second app or install speculative dependencies to match historical paths in sections 5–7.

Actual commands from package.json, to run when implementation/development is requested:

```powershell
npm install
npm run dev
npm run typecheck
npm run build
```

The data importer commands and caveats are documented in README.md and docs/research/DATA_CONNECTION.md. A later backend/RAG implementation needs its own verified setup and server-side credential handling. This documentation update installs nothing and does not create services, paid resources or a deployment.

## 13. Testing strategy

### 13.1 Retrieval and evidence — small acceptance set

Use a small hand-checked set of Portuguese/English questions covering solid flammability, detection, suppression, terrestrial transfer and an unsupported lunar/material question. Include an exact PSI-ID query and a missing-condition case. Check expected relevant investigation IDs near the top, justified differences/unknowns and working citations. Separate tune questions from a few untouched confirmation cases; do not claim benchmark accuracy from this smoke set.

### 13.2 Interaction and data integrity

Smoke one actual journey: select a structure/material, ask, inspect a ranked record, open the source, apply only supported fields, review inherited/unknown values, view an illustrative scenario and export provenance. Check stale responses after changing module/context and explicit degraded states on retrieval/LLM failure. Preserve existing focused data checks; no broad suite or paid-call replay system is a prerequisite.

### 13.3 Optional prediction only

Run a target-specific calibration/held-out comparison only if a numerical prediction is actually added. Keep its scope narrow and record the result; do not weaken its claim gate to save time. Failure disables that prediction only. An illustrative sphere is not a physical-validation test, and increasing trajectory count is not increased epistemic confidence.

## 14. Known risks and mitigations

| Risk                                        | Likelihood | Impact | Mitigation                                                   |
| ------------------------------------------- | ---------- | ------ | ------------------------------------------------------------ |
| Compatible quantitative labels unavailable or validation fails | High | Med | Keep evidence retrieval and illustrative scenarios; omit unsupported prediction |
| Markov simulation too slow for 3000 cells   | Medium     | Med    | Numba JIT the hot loop, downgrade to 1500 cells if needed    |
| PSI API changes schema                      | Medium     | High   | Pin requests, test twice pre-hackathon                       |
| LLM API rate limits during demo             | Medium     | High   | Anthropic batch key, cached fallback for demo                |
| Three.js perf on judge laptop (4500 cells)  | Medium     | Med    | InstancedMesh, test on low-end, downgrade cell size if needed|
| Agent produces unsupported claim            | Medium     | High   | Strict prompt, structured output validation, evidence check  |
| Agent fails to flag extrapolation           | Medium     | High   | Deterministic flag in scenario_in, propagated through state  |
| Spread-rate extraction consumes delivery time | High | High | Timebox one compatible target; prioritize core retrieval and cited extraction |
| Scope creep into CFD                        | Medium     | Critical | Explicit no-CFD in this doc, enforced in standup            |
| Scope creep into partial-gravity claims     | Medium     | High   | surface_habitat_ltv explicitly extrapolation                 |
| Timeline scrubber UX confusing              | Low        | Med    | Play/pause + markers + current-time display                  |
| Smoke particles destroy framerate           | Low        | Low    | Hard cap 500, downgrade on FPS drop                          |
| RAG returns irrelevant chunks               | Medium     | Med    | Metadata filters, rerank for chat                            |
| Team member blocked by missing data         | Medium     | Med    | Pre-hackathon validation that all data loads                 |

## 15. What this project is not

- Not a CFD simulator. We do not solve Navier-Stokes, temperature PDEs, or species transport.
- Not engineering certification. Output is advisory for design review, not qualification.
- Not a general RAG chatbot. We constrain to NASA fire safety corpus.
- Not a game. There is no scoring, no levels, no narrative progression.
- Not a substitute for experimental evidence; accessible explanations and educational exploration are welcome alongside engineering/research use.
- Not a Moon Base design authority. Surface habitat template is explicitly extrapolation.
- Not a material qualification authority. We link to NASA-STD-6001B and SMEs.
- Not a replacement for engineering judgment.

## 16. Success criteria

Must-haves for the next complete slice:
- The existing 3D modules remain polished and interactive; surface/material selection supplies visible query context.
- User intent and that context produce relevant, explainable ranked investigations and records, not only document snippets.
- Answers summarize and interpret retrieved evidence with citations; unavailable fields/claims produce a clear gap, not invented values.
- Comparable experimental fields can be inspected/exported with units, original records and provenance, supporting future predictive modeling.
- Research is organized by prevention, detection, suppression, safety equipment and applicable terrestrial connections.
- The scenario/evidence panel separates directly supported matches, analogs, unknowns and explicit incompatibilities.
- Interactive fire visualization retains an always-visible fidelity label and applied/inherited-condition provenance. No unvalidated physical probabilities or times.
- Sources include selected PSI artifacts and actually used documents/models; no blanket completeness or certification claim.
- A real demo journey and essential integrity checks pass; service failures and no-evidence cases are understandable.
- Pitch/submission format follows the actual official guidance, not an unverified duration or historical opening anecdote.

Stretch, only after core delivery:
- Verified experimental video/time-series replay linked to the selected specimen.
- One quantitatively calibrated and independently checked local target; never unlock a whole-cabin predictor by association.
- A third habitat, upgraded geometry, richer visual regimes, cited dossier export or a measured-value comparison view.
- Additional specialized agents only if a concrete task needs them.

## 17. Glossary

- **PSI:** NASA Physical Sciences Informatics.
- **NTRS:** NASA Technical Reports Server.
- **CIR:** Combustion Integrated Rack on the ISS.
- **MSG:** Microgravity Science Glovebox on the ISS.
- **MDCA:** Multi-user Droplet Combustion Apparatus.
- **BASS, BASS-II:** Burning and Suppression of Solids.
- **FLEX, FLEX-2:** Flame Extinguishment Experiment.
- **ACME:** Advanced Combustion via Microgravity Experiments.
- **CFI, CFI-G:** Cool Flames Investigation (droplet, gas).
- **SAME, SAME-R:** Smoke and Aerosol Measurement Experiment.
- **DAFT:** Dust and Aerosol Measurement Feasibility Test.
- **SAFFIRE:** Spacecraft Fire Safety Experiment (I through VI), inside uncrewed Cygnus. Primary calibration source for propagation model.
- **Cygnus:** Northrop Grumman cargo spacecraft, Saffire host post-undock.
- **Orion:** NASA crewed spacecraft for Artemis.
- **LUCI:** Lunar-g Combustion Investigation (future).
- **FM2:** Flammability of Materials on the Moon (future).
- **NASA-STD-6001:** NASA material flammability standard.
- **Test 1:** Material upward-flame-propagation qualification under a prescribed test atmosphere/configuration; not a universal safety result at all pressures, oxygen fractions or gravities.
- **Fire envelope:** research description of conditions supporting sustained combustion for a defined sample/regime; no classifier is currently implemented.
- **Hidden-risk zone:** materials passing Test 1 but failing in spacecraft cabin.
- **Markov chain fire propagation:** optional unimplemented model proposal, requiring compatible measurements and independent validation; not the current animation.
- **Monte Carlo trajectory:** one random realization of the Markov simulation.
- **Extrapolation mode:** scenario outside NASA tested parameter range.
- **Cell grid:** discretization of vehicle interior surfaces into 10cm cells for simulation.
- **Universal Event:** virtual local event for Space Apps.

---

End of spec v1.4. Consult the authoritative priority and fidelity rules before using retained v1.3 research sketches.

## Official-resource review and terminology

- `docs/architecture/EVIDENCE_RETRIEVAL_AND_SCENARIO.md`: retrieval context, embeddings, hybrid ranking, applicability gates, three visualization modes and primary sources.
- `docs/research/DATA_CONNECTION.md`: actual downloaded formats, record grain, unit conversions and importer limitations.
- `GLOSSARY.md`: canonical investigation, experimental-record, evidence-bundle, illustrative-scenario, experimental-replay and calibrated-prediction terminology.
- Official resource tab and video are linked in the architecture bibliography; the video segments 0:53–1:48, 4:18–6:56 and 7:16–8:30 anchor lunar relevance, corpus navigation and the required outcomes.
