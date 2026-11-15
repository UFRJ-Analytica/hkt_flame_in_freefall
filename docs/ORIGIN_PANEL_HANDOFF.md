# Origin panel integration handoff

Base: `develop` at `837f62c`. Worktree: `C:/Users/lucas/Documents/hf-origin`, branch `feat/origin-panel`. No simulator files or `App.tsx` changed.

## Mount contract

Import `{ OriginPanel }` from `./OriginPanel` inside the habitat module, and mount it only while its “Model & evidence” dialog is open. Props:

- `anchorTrialId: string`: selected registry trial ID, e.g. `SAFFIRE-I-S1`, `SAFFIRE-III-S1`, `SAFFIRE-VI-2`.
- `piece: { lengthMm: number; widthMm: number }`: actual configured fuel-piece dimensions in millimetres.
- `onClose: () => void`: hide/unmount the panel.

CSS is imported by the component. The dialog fetches `data/saffire/trial-registry.json` relative to Vite's base URL, not `data/trial-registry.json`. Sources remain canonical. The compact replay always identifies its SAFFIRE I S1 foundation and calls the existing `simulateFromObservedFront` unchanged with seed 1951; it does not pretend to be the selected trial's distinct replay. The observed card preserves separately labelled windows/rates, including SAFFIRE III's two-camera holdout and camera-1 cross-trial estimates. Runtime calibration remains the responsibility of the habitat's model panel.

## Equivalence verdict

`node --test scripts/test_origin_equivalence.mjs`: seven tests passed against the unchanged motors at the base revision. The replay and habitat are **not pathwise/same-seed equivalent**, even with identical 94 × 21 grid, kernel and complete initial state.

- All 22 measured seeds produce different cell arrival fields.
- For seed 1951, 1,301 cell arrival times differ; first difference is x=15,y=1: replay step 2, habitat step 1.
- Replay uses row-major traversal; habitat uses a FIFO frontier, assigning the identical random sequence to different cells.
- Null observed rows also have different boundary semantics. The real S1 artifact has no null rows, so that is a separately tested distinction, not the explanation of its observed divergence.
- Deterministic unmasked controls agree. No claim of ensemble equivalence or physical validation is made.

Use “trial-derived spatial rule” rather than “identical trajectory” in the product story. Neither motor was modified.

## Verification

- `npx tsc --noEmit -p .`, `npm run typecheck`, `npm run build`: passed.
- `npm run sim:check`: 49 passed.
- `node --test scripts/test_origin_panel.mjs scripts/test_origin_equivalence.mjs`: 11 passed.
- Browser origin preview with real registry/model: dimensions, reference playback, unknown ID, missing source field, and simulated registry HTTP503 handled. A 400 × 4000 mm piece retains its 0.1 rendered aspect ratio; sample view is clipped to the nominal 940 × 406 mm.
- Forward/reverse focus wrapping verified with sources collapsed and expanded; Escape/close owned by panel. Shared focus hook unchanged.
- Mobile at390px: document width390px, panel370px, no horizontal overflow.

The standalone preview is a local scratch harness, not a production route and not included in this branch. Mounting the panel into `HabitatLab` is intentionally reserved for the parallel simulator owner.
