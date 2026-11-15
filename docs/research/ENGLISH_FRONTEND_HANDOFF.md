# English frontend handoff

Scope: English user-facing HabitatFire UI on the existing develop checkout; no commit, merge, push or deployment was performed.

## Implementation

- Translated navigation, habitat and A/B controls, model applicability, SAFFIRE modes, Specialist workspace, catalog, research panel, BASS-II, SAME and SoFIE observations, loading/error/help/accessibility copy and document metadata.
- Number formatting uses en-US.
- `src/i18n/english.ts` and three exact-string dictionaries translate scientific descriptions at presentation boundaries. Original source datasets, identifiers, material matching keys, raw cells, scientific numbers, canonical JSON/CSV payloads and hashes are preserved.
- Specialist Markdown export receives a display translator without mutating the underlying dossier.
- Research API user-facing responses and generation instructions use English. Multilingual retrieval remains supported. Added regression coverage against unrelated-negation certification-claim bypasses.

## Verified on final working tree

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run sim:check`: 32 passed.
- `node --test scripts/test_english_frontend.mjs`: 4 passed.
- `python -m unittest discover -s backend -p 'test_*.py'`: 15 passed, offline.
- `git diff --check`: passed.
- `git diff --name-only -- public/data data`: empty; original scientific artifacts unchanged.
- Browser checks exercised habitat, Specialist workspace, catalog, BASS B1 observation, SoFIE observation, SAME Smoke & Detection and cabin/research controls. Final SAME and cabin page language scans returned no Portuguese candidates.
- The standalone Vite audit had no running research API; its English unavailable/error state was checked. Live provider generation was not invoked; API behavior was exercised through offline tests.

## Integration notes

Changes are uncommitted in `C:/Users/lucas/Documents/hkt_nasa_flame_snapshot_20261114` on develop. Include the new `src/i18n/` directory and `scripts/test_english_frontend.mjs` along with tracked changes when preparing a publication. Do not regenerate or translate the audited scientific source artifacts to achieve UI localization. Original evidence/raw exports may retain original-language content by design.
