# Landmark icon scaling implementation plan

> **For agentic workers:** Implement the approved scope in this session. Use subagent-driven development for independent CSS/layout and scene integration work, with root-owned scaling logic and browser verification.

**Goal:** Keep map icons proportional to the zoomed view while remaining readable and clickable.

**Architecture:** A shared `createLandmarkIconScaler(labels, camera, target)` captures the initialized overview framing and returns an `update()` function. It adjusts SVG dimensions through CSS variables, preserving the CSS2D position transform, names and button behavior. Label avoidance uses the actual button size.

**Tech Stack:** Existing Three.js perspective cameras, CSS2DRenderer, CSS/SVG and Node tests.

---

### 1. Scale rules and regression checks

- [x] Add `src/shared/landmark-scale.js` and `tests/landmark-scale.test.js`.
- [x] Verify a failing behavior test before implementing the rules.
- [x] Capture framing as `distance(camera.position, target) * tan(effectiveFov / 2)` after initial resize. Use `22 * sqrt(referenceFraming / currentFraming)`, clamped to 14–30 CSS pixels, rounded to a tenth of a pixel.
- [x] Active, open, pinned, hovered or keyboard-focused icons have a 22px minimum.
- [x] Button dimension is `max(originalButtonDimension, iconDimension + 4)`. Store it in `label.userData.landmarkHitSize`; update `--landmark-icon-size` and `--landmark-hit-size` only when dimensions change.
- [x] Check distance bounds, lens zoom, joint camera/target panning, interaction size minimums and stable-frame writes with real Three.js cameras and small DOM fixtures.

### 2. CSS, avoidance and scene integration

- [x] Adjust only icon/button dimensions in `src/landscape/style.css` and `src/zhuozheng-garden/garden.css`. Retain white text and transparent backgrounds.
- [x] Make `src/shared/landmark-layout.js` use the actual button size. Add projected 34px edge/collision tests in `tests/landmark-layout.test.js`.
- [x] Integrate the shared factory after initial resize in Huangshan, West Lake, Zhuozheng Garden, Leifeng, Santan and Lingyin scene files. Update after controls and before label avoidance/rendering. Clear collected scenic labels on disposal. Apply the shared avoidance step in all six scenes; garden labels also use leader lines.
- [x] Preserve current World/session state, transitions, panning and existing West Lake POI visibility rules.

### 3. Local validation

- [x] Run focused scale/layout tests, then the full Node suite and production build.
- [x] Browser-check actual distant/near icon dimensions, selection/focus minimums, clickable white names, edge avoidance and mobile viewport in the relevant scenes.
- [x] Save final screenshots under `previews/`, add a concise README verification record and reset temporary browser viewport overrides.
- [x] No Git staging, commit, push or deployment; preserve the existing dirty and staged worktree.
