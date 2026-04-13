# Flower Power — Session Log

## Project Vision
Interactive watercolor bloom animation. A single flower form — pure radial gradient blobs, no edges, no paths — loops through three user-designed states (A → B → C → A). The interest is entirely in the morphing transitions. Users design each state via a bottom panel, then hit play.

## Tech Stack
- Single `index.html`, no build step, no libraries
- Canvas 2D API — radial gradient blobs, single blur pass per frame
- Vanilla JS, Google Fonts (IBM Plex Mono)
- Seeded PRNG: mulberry32 for per-blob organic jitter

## Current State (2026-04-13)
**Session 1 — initial build complete.**

### What's built
- Full flower rendering: gap blobs → petal blobs → center glow → single blur composite → post-blur center glow → paper texture overlay (7% multiply)
- Three-state animation loop: A → B → C → A with coil → burst → settle transition curve
- Idle breathing: per-blob sinusoidal oscillators with golden-ratio-spread periods/phases
- Bottom panel UI:
  - State tabs A / B / C with live canvas thumbnails (64×64 rendered with blur)
  - Per-state sliders: Petals (5–13), Reach (0.3–0.85), Spread (0–1), Twist (0–359°)
  - 8 curated palette swatches (assigns petalHue / gapHue / centerHue)
  - Global sliders: Blur, Tempo, Pulse
  - Play / pause button
  - Status indicator (settled · A / → B etc.)
- Registration marks + spine label

### Default states
- **A**: 7 petals, reach 0.65, spread 0.45, twist 0° — Yellow/Pink/Gold (hues 50/330/45)
- **B**: 9 petals, reach 0.55, spread 0.30, twist 20° — Blue/Coral/Cyan (hues 210/15/185)
- **C**: 6 petals, reach 0.72, spread 0.60, twist 45° — Orange/Pink/Red (hues 25/330/5)

## Known Issues / Next Steps
- Petal count interpolation uses `Math.round()` — blobs snap at midpoint rather than true split/merge. Fine for MVP.
- Thumbnail rendering creates a temporary canvas per call — could cache if perf becomes an issue.
- No localStorage persistence of state edits between sessions (v2 feature).
- No "tension" indicator between adjacent states (v2 feature).
- Per-state count (with animated split/merge) is v2.

## File Structure
```
flowerpower/
  index.html     ← entire project (CSS + JS inline)
  CLAUDE.md      ← this file
```

## Deployment
- Push: `git push personal main`
- Deploy: `vercel --yes --prod`
- GitHub account: lzrfngs (personal)
- Vercel account: christopherpalazzo-2527
