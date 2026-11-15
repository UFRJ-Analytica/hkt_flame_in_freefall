# HabitatFire — submission draft

## Project title

HabitatFire: From NASA Combustion Evidence to Crew-Habitat Design

## Short summary (50 words maximum)

HabitatFire turns NASA microgravity combustion research into an interactive fire-safety workbench. SI finds and explains relevant investigations, users extract traceable modeling data, and experimental replays connect measurements to exploratory habitat scenarios. Engineers can explore materials, atmospheres and fire-safety systems without losing the source behind each finding.

## Project description

NASA combustion evidence is distributed across experimental tables, reports, images and videos. HabitatFire brings those resources into one English-language workbench for people designing spacecraft, orbital stations, lunar habitats and pressurized rovers.

We address the three Flame in Freefall objectives through a connected workflow:

1. **Identify relevant investigations.** SI, our research assistant, uses evidence search and investigation-ranking tools to explain which experiments matter for the selected environment and question. Answers cite retrieved passages or PSI record IDs, and the ranked investigation list can update as the conversation develops.
2. **Extract data for predictive modeling.** An interactive table brings together source-linked quantities and experimental conditions. Users filter and select rows, then export CSV or JSON with units and provenance. Measured char fronts, published flame-base rates, flammability outcomes, extinction observations, smoke sizes and raw test conditions retain their distinct identities.
3. **Connect research to fire-safety design.** Evidence briefs organize findings around materials and layout, atmosphere and oxygen systems, smoke detection, suppression, and post-fire recovery. They link measured findings to design implications and the next evidence needed for a lunar environment.

The Simulation lab makes those connections tangible. Its existing habitat experience applies SAFFIRE-derived stochastic surface-propagation rules to configurable material zones and imposed ignition, with repeatable realizations and A/B comparisons. The new Model & evidence panel connects the selected NASA trial, an unchanged SAFFIRE I model replay on its original sample, and the dimensions of the user's piece.

**Release integration note — remove after verification:** the new length/width-configurable SIBAL piece is being implemented on the parallel simulator branch. This origin-panel branch deliberately does not change or mount into `HabitatLab`. Confirm the combined feature before describing configurable piece dimensions as shipped. The draft demonstration sequence below includes that planned integration.

Experimental replays share playback controls while preserving their original data: BASS-II B1 tracked optical fronts in pixels; SAFFIRE II camera images; the SAFFIRE I stochastic model; SoFIE-GEL public-video analysis; and SAME measurement windows. FLARE's published flammability-limit evidence remains an interactive static view rather than an invented flame animation.

The product is an exploratory research and design workbench, not spacecraft fire certification.

## Suggested demonstration sequence

1. Select a lunar habitat and ask SI which investigations inform oxygen-enriched cabin fabrics.
2. Inspect the ranked investigations and supporting source passages.
3. Ask SI to select modeling data; filter and export the source-linked rows.
4. Open the Simulation lab, configure a SIBAL piece's length, width and ignition, then compare two designs using the same seeds. **Requires final integration verification.**
5. Open Model & evidence: NASA trial → original-sample model replay → configured piece.
6. Explore the BASS-II, SAFFIRE, SoFIE-GEL and SAME replays, then the FLARE evidence view.
7. Return to fire-safety controls to discuss what the research informs and what should be tested next.

## Data inventory verified in the repository

- **24 PSI combustion investigations**, containing **2,001 tabulated records**. These are source-table rows, not 2,001 independent experiments.
- **14 documents and 197 passages** in the bundled research corpus. PSI metadata is also a retrieval source; this count does not assert that every table row or video frame is vectorized.
- **10 challenge resources are listed** in the coverage map; **9 have data/indexed coverage**. The ScienceCasts resource is metadata-only and is not quoted by SI as a retrieved transcript.
- **9 SAFFIRE trials** in the specialist trial registry, with separate observations, source conditions and model artifacts.
- The replay gallery has **6 entries**: five playback experiences and static FLARE evidence. The gallery is not six interchangeable predictive fire models.

Count sources: `public/data/nasa-experiments.json`, `public/data/research-corpus.json`, `public/data/saffire/trial-registry.json`, `src/dashboard/coverage.ts`, and `src/components/replay/replayCatalog.ts`.

## NASA challenge resources and references

1. **Physical Sciences Informatics: Combustion Science** — experimental investigation metadata, source tables and media references. https://psi.nasa.gov/
2. **NASA Glenn Combustion Science** — program context and investigation overviews. https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
3. **NASA ScienceCasts: The Power of Studying Combustion on the ISS** — resource catalog entry only; no transcript indexed. https://www.issnationallab.org/blog/nasa-sciencecasts-the-power-of-studying-combustion-on-the-iss/
4. **A Researcher's Guide to ISS Combustion Science (2015)** — page-linked research context. https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf
5. **Apollo 1** — historical fire-safety context. https://www.nasa.gov/mission/apollo-1/
6. **Apollo 13** — historical atmosphere and equipment context. https://www.nasa.gov/mission/apollo-13/
7. **25 Years Ago: Fire Aboard Space Station Mir** — historical fire and response lessons. https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/
8. **NASA Spinoff: Fireman's Air Tanks** — breathing-equipment technology transfer. https://spinoff.nasa.gov/node/9582
9. **NASA Spinoff: Fire Detector** — historical spacecraft smoke detection and technology transfer. https://spinoff.nasa.gov/node/9407
10. **NASA Spinoff: New Technology for the Fire Attire** — protective-clothing technology transfer. https://spinoff.nasa.gov/node/9918

Additional investigation pages, published SAFFIRE and SoFIE papers, and JAXA FLARE publications are linked from their respective in-app evidence panels and the repository's `docs/research/` reviews. FLARE partner-program context: https://humans-in-space.jaxa.jp/en/biz-lab/experiment/theme/detail/000807.html

## Tools and architecture

- **Frontend:** TypeScript, React, Vite, Three.js, React Three Fiber and Drei.
- **Research/data backend:** Python, reproducible source ingestion and scientific-data reduction scripts.
- **SI:** Claude with read-only scientific retrieval tools and validated page-selection actions.
- **Search adapters:** Voyage embeddings and MongoDB Atlas hybrid semantic/keyword retrieval, with a lexical/structured fallback.
- **Deployment target:** AWS EC2, Caddy HTTPS and a Python application service; deployment scripts are included in `deploy/`.

The repository implements these adapters and deployment scripts. This submission draft does not establish that external providers, Atlas indexes or an EC2 deployment are currently configured or healthy; verify the final demo environment separately. No paid provider or deployment was invoked to prepare this draft.

## AI-use disclosure draft

AI assistants supported implementation, documentation and scientific-evidence extraction. SI is also a product feature: it retrieves sources before producing cited explanations. Preliminary AI-assisted visual annotations in experimental analyses retain their review status in the scientific documentation; they are not represented as independent human-reviewed measurements. The team should confirm the final tool/model list and contributions before submitting.

## Repository

https://github.com/UFRJ-Analytica/hkt_flame_in_freefall

## Team-only release checklist (not submission copy)

- Verify the integrated configurable SIBAL piece and mount `OriginPanel`; remove the integration notes above only after that flow works.
- Verify SI, provider/index status and the public demo URL without exposing credentials. Do not infer live readiness from the frontend build.
- Attach the final demonstration video and list all sources, tools, code and media used.
- Check that claims match the actual release commit, especially indexing coverage and exploratory modeling.
- The user supplied a deadline of **15 November 2026, 23:59 local time**; confirm the Team Owner's event/timezone and portal deadline.
- The base repository includes earlier local work. Confirm development-window and reuse eligibility with the organizers; excluding older files from these new commits does not itself prove project eligibility.
