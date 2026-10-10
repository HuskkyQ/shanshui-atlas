# West Lake Phase 1 and Scenic Scene Foundation Implementation Plan

> **For agentic workers:** Execute the scoped tasks below with separate file ownership. Source changes are local only; no commit, push, or deployment is authorized.

**Goal:** Complete the existing West Lake World POI interaction and establish the minimum interfaces for a future detailed Scenic Scene.

**Architecture:** Keep the current Vite entry, Three.js scene factories, terrain, routes, forest and silhouette icons. Unify existing POI records; apply visibility tiers without changing geographic anchors. Add a scene registry and a small session module that owns asynchronous entry/exit and restores the World state; register future scenes as planned without fake model URLs or visible entry buttons.

**Tech Stack:** JavaScript modules, Three.js, JSON content, Vite, Node test runner.

## Approved scope

- Phase 1: existing World, POI visibility tiers, hover/focus, selection/highlight, interruptible camera movement and information cards. Core discovery points are 雷峰塔、灵隐寺、三潭印月; keep all existing grouped POIs accessible through the side menu.
- Phase 2 foundation: registry, separate content, loader contract, World capture/restore/pause, safe entry/exit/disposal. No detailed scene or asset is claimed complete.
- Preserve the Huangshan/West Lake homepage, favorites, immersive mode, remove-lighting mode, route layers, forest LOD and Shift-left panning.
- Not in this implementation: new high-detail buildings, first-person navigation, timeline/historical reconstruction, automatic guided paths, AI or hosting changes.

## Task 1: Unified POI data and visibility

Files: `src/west-lake-pois.js`, `src/poi-visibility.js`, `tests/poi-visibility.test.js`, integration in `src/west-lake-scene.js` and `src/exhibit.js`.

- [x] Reuse existing source coordinates, IDs, descriptions and category groups. Add importance, entity type and future scene links only.
- [x] Keep core POIs discoverable. Use distance tiers with hysteresis; retain selected/focused points even when ordinary filtering would hide them.
- [x] Verify unique IDs, unchanged coordinates, thresholds, hysteresis and interaction overrides using `node --test tests/poi-visibility.test.js`.

## Task 2: Scenic Scene foundation

Files: `src/scenic-scenes.js`, `src/scene-session.js`, `src/content/west-lake-scenic.json`, `tests/scene-session.test.js`, `docs/west-lake-scenic-scenes.md`; World state methods in `src/west-lake-scene.js`.

- [x] Planned registry entries have no fabricated assets or working entry controls.
- [x] Load only on explicit entry. Failure keeps World usable; exit or disposal invalidates late results and releases owned Scenic resources.
- [x] Capture and restore position, target, zoom, selected view, category, motion and interaction modes. Pause the World loop only while a ready Scenic Scene is active.
- [x] Verify success, failure, cancellation, late completion, planned-scene rejection and disposal with `node --test tests/scene-session.test.js`.

## Task 3: Integration verification

- [x] Run `npm test` and `npm run build`; review only related diffs.
- [x] In production local preview verify core discovery, zoom-dependent detail, category selection, hover/focus/click card correspondence and user interruption of camera movement.
- [x] Check immersive/lighting toggles, Shift controls integration and both model entrances. No extra hosted deployment or source synchronization.
- [x] Record actual checks separately from future Scene capabilities.

## Verification record

- `npm test`: 60/60 passed, including five POI rules and eight Scenic session lifecycle tests.
- `npm run build`: passed; existing large-chunk warning remains.
- Local production preview: desktop core discovery, closer POIs, side/map selection, immersive selection consistency, keyboard activation, 390×844 pinned card bounds, remove/restore lighting, manual drag interruption, Huangshan loading and both homepage entrances checked.
- Shift-left panning is covered by the existing OrbitControls integration tests; no full modified drag gesture was simulated in the browser this round.
- Scene lifecycle tests use test instances. There are no ready Scenic assets or live detailed-scene entry controls, so real Scenic browser switching and GPU frame-rate measurement remain future checks.
