# Leifeng Scenic Scene Implementation Plan

> **For agentic workers:** Use separate file ownership and review each completed part. Preserve the existing dirty worktree. This task is local only; no commit, push, source synchronization or publication.

**Goal:** Deliver the first usable West Lake Scenic Scene: enter Leifeng, explore four sourced hotspots and return to the unchanged World view.

**Architecture:** Keep the existing World and homepage. Enable only Leifeng in the existing registry through a dynamic module import. A locally generated model and its own scene own their resources; the existing session pauses/restores World, while the exhibit UI handles loading, content and return.

**Tech Stack:** Three.js, CSS2DRenderer, existing Shift-pan controls, JSON content, Vite, Node tests.

## Scope and contract

- Modern Leifeng appearance in the current artistic style: octagonal tower, five exterior floors, roof/eaves, pillars, balcony rails, plinth and entrance steps; nearby trees, ground and a schematic lake/mountain backdrop.
- Four hotspots: tower, base, eaves, lake-view. Sources and descriptions are stored in `src/content/leifeng-pagoda.json`; dimensions and surroundings are artistic approximations, with no claim of surveyed reconstruction.
- `createLeifengModel()` returns `{group, anchors}`. `createScene({container,onHotspot})` returns an unmounted instance with synchronous `mount`, `selectHotspot`, `resetView` and idempotent `dispose`.
- Session exposes the mounted instance for the scene-specific controls. Exit/cancel invalidates pending loads and disposes owned resources; World position, target, selection and interaction modes remain intact.
- Lingyin and Santan remain planned. No historical reconstruction, first person, automatic tour, AI or hosting change.

## Task 1: Model and cultural content

Files: `src/models/leifeng-pagoda.js`, `src/content/leifeng-pagoda.json`, `tests/leifeng-model.test.js`, `docs/leifeng-pagoda-sources.md`.

- [x] Verify Chinese primary sources for exterior form and cultural descriptions; avoid conflicting English stories/sides translations.
- [x] Produce the original procedural model with merged or instanced details and four scene anchors.
- [x] Test finite geometry, floor/form consistency, entry/step alignment, useful anchors and bounded geometry/draw count with `node --test tests/leifeng-model.test.js`.

## Task 2: Scenic renderer and lifecycle

Files: `src/scenes/leifeng-pagoda.js`, `src/scenic-scenes.js`, `src/scene-session.js`, `tests/scene-session.test.js`.

- [x] Use `loader: context => import('./scenes/leifeng-pagoda.js').then(module => module.createScene(context))` only for Leifeng.
- [x] Create WebGL only during mount; add interruptible hotspot camera positioning, reset view, CSS2D markers and Shift-pan controls.
- [x] Dispose before or after mount safely, releasing rAF, observer, listeners, contexts, geometry and DOM. Keep session success/failure/cancel tests meaningful after registry activation.

## Task 3: Entry, return and verification

Files: `src/exhibit.js`, `src/exhibit.html`, `src/style.css`, `README.md`, `docs/west-lake-scenic-scenes.md`.

- [x] Show entry only for ready scenes; display cancellable loading and retryable errors. Preserve the World UI through entry instead of reconstructing it on exit.
- [x] Give Scenic a compact title, four content buttons, sourced information, reset and return controls; support keyboard and narrow screens.
- [x] Run `npm test`, `npm run build`, `git diff --check`; inspect related diffs only.
- [x] Browser-check desktop/mobile entry, four hotspots, camera controls, return from normal and immersive World, loading cancellation and repeated entry/exit. Record actual checks and remaining accuracy/performance boundaries.

Implementation status: all scoped implementation and final browser regression checks are complete. Browser checks covered 1280×720 and 390×844, four content buttons and map hotspots, hotspot keyboard activation, mouse rotation, wheel zoom, reset, three repeated entry/exit cycles, normal and immersive return state, homepage dual cards and Huangshan entry, and mobile card bounds; console error/warn output was empty. Loading cancellation/retry under network delay remains covered only by automated test instances, complete Shift-pan was covered by OrbitControls integration tests rather than browser simulation, and GPU frame time/heap were not measured. Lingyin and Santan remain deliberately planned for a later phase.
