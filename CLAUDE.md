# Flower Power — Session Log

## Project Vision
Interactive watercolor bloom animation. A single flower form loops through three user-designed states (A → B → C → A). The interest is in the morphing transitions and the organic, living quality of the flower. Users design each state via a bottom panel, then hit play.

## Tech Stack
- Single `index.html`, no build step
- **p5.js** for rendering — bezier petal shapes, Perlin noise for organic variation
- Google Fonts (IBM Plex Mono)
- Canvas 2D shadow API for watercolor glow effect
- Vanilla Canvas 2D for thumbnails (bypasses p5.js for speed)

## Current State (2026-04-13)
**Session 3 — complete rewrite with p5.js, proper petal shapes, fixed all major bugs.**

### What changed in session 3
- **Engine rewrite:** Replaced vanilla Canvas 2D radial gradient blobs with p5.js bezier petal shapes. Completely different rendering approach.
- **Petal shapes:** Each petal is a bezier curve teardrop — pointed tip, curved sides, organic asymmetry via Perlin noise per-petal. Three layers per petal: wash (soft, faint), main body (rich), dark vein (narrow accent).
- **PRNG cascade fixed:** Old mulberry32 PRNG caused colors to shift when changing any slider (petal count changed # of sequential random calls). Now using `noise(index)` — each petal's variation is based on its index, completely independent of other petals.
- **Three petal rings:** Gap petals (between main, shorter, different hue), main petals (primary layer, with shadow glow), inner accent petals (rotated half-step, smaller). Creates natural depth.
- **Shadow glow:** Main petals use `drawingContext.shadowBlur` for watercolor bleed effect — soft halo extends beyond petal edges.
- **Animation overhaul:** Continuous ambient motion (breathing, per-petal flutter, slow rotation) driven by Perlin noise. Always alive, even when paused. Play/pause controls state cycling, not the organic animation.
- **Responsive controls:** Editing mode — when user drags a slider or clicks a swatch, the flower immediately shows that state. Returns to animation flow 1.5s after last edit.
- **Performance:** No CSS blur filter (was crashing). No offscreen buffer. Efficient bezier rendering at native resolution. ~80 draw operations per frame.
- **Global controls** (Blur, Tempo, Pulse) commented out in HTML until basics are fully tuned.
- **Thumbnails:** Simplified bezier petal rendering via vanilla Canvas 2D (no p5.js overhead). Debounced updates during slider drags.
- **Play button fixed:** Correct icon logic (▶ when paused, ‖ when playing).
- **Encoding fixed:** UTF-8 without BOM, HTML entities for special characters.

### What's built
- Three-ring flower with bezier petal shapes, layered watercolor technique
- Three-state animation loop: A → B → C → A with eased cubic transitions (3s duration)
- Continuous ambient animation: breathing (noise-based scale), flutter (per-petal angle oscillation), slow rotation (~67s per revolution)
- Bottom panel UI:
  - State tabs A / B / C with live bezier-petal thumbnails
  - Per-state sliders: Petals (5–13), Reach (0.3–0.85), Spread (0–1), Twist (0–359°)
  - 8 curated palette swatches (assigns petalHue / gapHue / centerHue)
  - Play / pause button with correct state indication
  - Status indicator (settled · A / editing · A / → B)
- Paper texture overlay (6% multiply grain)
- Registration marks + spine label
- Background wash: soft concentric halo behind flower

### Default states (unchanged)
- **A**: 7 petals, reach 0.65, spread 0.45, twist 0° — Yellow/Pink/Gold (hues 50/330/45)
- **B**: 9 petals, reach 0.55, spread 0.30, twist 20° — Blue/Coral/Cyan (hues 210/15/185)
- **C**: 6 petals, reach 0.72, spread 0.60, twist 45° — Orange/Pink/Red (hues 25/330/5)

## Known Issues / Next Steps
- Warm yellow hues (40-60) render as olive at current HSB brightness — might need per-hue brightness adjustment.
- Petal count interpolation uses `Math.round()` — snaps at midpoint during transitions. Acceptable for now.
- Global controls (Blur, Tempo, Pulse) commented out — re-enable once core aesthetic is approved.
- No localStorage persistence of state edits between sessions (v2 feature).
- Consider adding petal tip rounding option — currently all tips are pointed.
- `index_v1.html` is the pre-p5.js backup — can be deleted once v2 is confirmed.

## File Structure
```
flowerpower/
  index.html     ← entire project (CSS + JS inline, p5.js via CDN)
  index_v1.html  ← pre-p5.js backup (vanilla Canvas 2D version)
  CLAUDE.md      ← this file
```

## Deployment
- Push: `git push personal main`
- Deploy: `vercel --yes --prod`
- GitHub account: lzrfngs (personal)
- Vercel account: christopherpalazzo-2527
