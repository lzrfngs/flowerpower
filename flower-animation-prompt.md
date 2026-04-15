# Watercolor Flower — Claude Code Prompt & Context

> Three states. Always in motion. Bursting outward, forever.

---

## Project Vision

A single flower form, viewed from directly above, fills the canvas. No stem. No leaves. Pure bloom.

The form is made entirely of soft, blurry colored blobs arranged radially — petal blobs radiating outward from a glowing center, gap blobs nestled between them, everything bleeding into everything else. There are no edges. The structure is defined by color contrast, not by shape. It reads as a flower the way a Rorschach reads as a face — through suggestion, not accuracy.

The flower is always in motion. Even at rest, it breathes outward — each petal blob pulsing slightly on its own timer, the center glowing and dimming, the outer edge rippling. The energy is centrifugal: always pushing out from the middle.

The user defines three states (A, B, C). The flower loops A → B → C → A, morphing continuously. Transitions are not calm fades — they pulse. The whole form swells outward before settling into the next configuration, like a heartbeat driving the change.

---

## Aesthetic Reference

The Instagram reference shows exactly the rendering target: soft radial blobs on a warm cream background. Three frames show different configurations — yellow/pink, blue/coral, orange/pink — all using the same structural approach with different colors and slightly different petal counts. The forms feel hand-painted and alive without being realistic.

Key visual properties to match:
- Warm off-white/cream background (not dark)
- No hard edges anywhere — everything bleeds
- Color contrast between ray positions and gap positions creates the petal illusion
- Outer edge is organic and lumpy, not a perfect circle
- Center glows more intensely than the outer blobs

---

## Background

Light cream: `#EAE4D8` (warm, slightly yellowish off-white — like watercolor paper)

This is non-negotiable for the aesthetic. The soft blobs *require* a light ground to read correctly.

---

## Tech Stack

**Single `index.html`. No build step. All JS and CSS inline.**

- Canvas 2D API with radial gradients, compositing, and blur filters
- Vanilla JS, no libraries except Google Fonts
- Google Fonts: IBM Plex Mono (UI controls) — same as Mantle Creep
- Inline seeded PRNG (mulberry32) for stable per-cycle variation

---

## Rendering Technique

The flower is drawn as a stack of soft radial gradient blobs on an offscreen canvas, then composited onto the main canvas.

### Layer structure (drawn in order):

**1. Background fill**: solid cream `#EAE4D8`

**2. Gap blobs** (N blobs, one per gap between petals):
Each gap blob is a radial gradient ellipse, wider than tall, centered at a mid-gap angle at ~60% of the petal reach. Color: the gap color from the current palette. Opacity: moderate. These fill the spaces between rays.

**3. Petal blobs** (N blobs, one per petal):
Each petal blob is a radial gradient ellipse, taller than wide (elongated radially). Positioned from near-center outward along the petal's angle. Color: the petal color from the current palette. The gradient goes from full-opacity at the inner third to transparent at the tip. These form the radiating rays.

**4. Center glow**:
A large, soft radial gradient circle at the canvas center. Color: the center color. Radius: ~25–35% of the flower's total reach. This is the brightest, most saturated point of the whole composition.

**5. Accent dots** (optional, like the orange dots in the reference):
Small soft blobs scattered near petal tips at randomized positions (seeded). A third accent color, small radius, low-medium opacity. Add character without structure.

**6. Paper texture overlay**:
An offscreen canvas generated once at init with fBm noise. Composited over everything at 8–12% opacity using `multiply` blend mode. Keeps the watercolor feeling.

### Blur:
Apply `ctx.filter = 'blur(Xpx)'` to the offscreen canvas before compositing onto the main canvas. Blur radius is a function of the flower's total size — roughly `totalRadius * 0.06`. This single blur pass does most of the watercolor work.

---

## Flower Form (replacing "anatomy")

The flower has no physical anatomy — no stem, no leaves, no distinct petal shapes. It is a radial color composition.

**Structure:**
- N petal blobs at angles: `index * (360 / N)` degrees, plus a global twist offset
- N gap blobs interleaved at `(index + 0.5) * (360 / N)` degrees
- One center glow
- Optional: small accent dots near petal tips

**What creates the "petal" illusion:**
The contrast between petal blob color and gap blob color. Yellow rays + pink gaps = yellow petals on a pink flower. Coral rays + blue gaps = the flower from the second reference image. The blobs don't have petal shapes — the *color pattern* does.

**Organic variation:**
Each blob's radius and position is offset slightly using the seeded PRNG (±8% variation). No two blobs are identical. This keeps the form from looking algorithmic.

---

## The State System

The user defines three states. The flower animates A → B → C → A, looping forever.

### What a state defines:

| Parameter | Description | Range |
|---|---|---|
| `count` | Number of petal blobs | 5–13 |
| `reach` | How far petal blobs extend from center | 0.3–0.85 (fraction of canvas half-size) |
| `spread` | Width of each petal blob (narrow = spiky rays, wide = fat petals) | 0–1 |
| `twist` | Rotational offset of the whole pattern | 0°–360° |
| `petal hue` | HSL hue of the petal/ray blobs | 0°–360° |
| `gap hue` | HSL hue of the gap blobs | 0°–360° |
| `center hue` | HSL hue of the center glow | 0°–360° |

Saturation and lightness are partially constrained by the palette system (not per-state) to keep things in the watercolor register. Users tune hue; the system handles the rest.

### Transition constraints — what makes transitions beautiful vs. harsh:

**Safe to change a lot between states:**
- Hues (color can shift dramatically — the reference shows this working)
- Twist (rotation looks intentional and beautiful)
- Spread (petal fatness changing is subtle enough to always read well)

**Change carefully — max ±3 between adjacent states:**
- `count` — petal count changes need the burst/split/merge technique to work; larger jumps are too disorienting

**Don't change simultaneously by large amounts:**
- `count` + `reach` together — expanding AND splitting at the same time reads as chaos
- All three hues changing maximally at once — too much visual noise

**The practical constraint the UI should enforce:**
Show a simple "tension" indicator between adjacent states — not an error, just a reading like "close / interesting / far." This guides the user without hard limits.

### Petal count changes — the split/merge technique:

When transitioning from N to N+1 petals: one blob widens during the burst pulse, then pinches into two narrower blobs that drift apart. The blur and the motion of the burst pulse conceal the structural seam completely.

When transitioning from N to N-1: two adjacent blobs drift toward each other during the burst, overlap, and merge into one. Again, the blur hides it.

Maximum recommended jump between adjacent states: ±3 petals. Beyond that, run through an intermediate configuration even if it's brief.

---

## The Loop — A → B → C → A

### Animation energy: centrifugal, outward, pulsing

The flower is never fully still. Even in a "settled" state:
- Each petal blob oscillates in `reach` by ±3–5%, on independent sinusoidal timers (periods between 1.5–4s, each blob offset)
- The center glow breathes (scale ±8%, 2s period)
- The outer edge ripples via low-frequency noise applied to blob positions

### The transition pulse

Between states, instead of a simple lerp:

1. **Coil** (0.3–0.5s): the flower contracts very slightly inward. A small inhale before the burst.
2. **Burst** (0.4–0.6s): `reach` overshoots its target value by 15–25%. The whole form expands outward past where it's going to land. This is where count changes happen — the bloom and split/merge are hidden in this expansion. Easing: fast ease-in.
3. **Settle** (0.8–1.2s): `reach` returns to the target value with a slight elastic overshoot. Colors lerp to their target values during this settle phase. Easing: elastic-out, subtle.

Total transition duration: ~1.5–2.5s. The rest of the cycle is the "settled" state, still breathing.

### Full cycle timing (at default tempo):

- State A settled: 6–10s
- A → B transition: ~2s
- State B settled: 6–10s
- B → C transition: ~2s
- State C settled: 6–10s
- C → A transition: ~2s
- Total: ~24–36s per loop (scaled by Tempo control)

---

## Control Panel

**MVP: five controls.** Plain draggable cards, same `.ctrl` structure as Mantle Creep. Label, value display, slider. No tooltips for now — names are placeholder.

| Label | Range | Default | Effect |
|---|---|---|---|
| **Petals** | 5–13 | 7 | Petal count (global, same across all states for MVP — state-specific count comes later) |
| **Reach** | 0.3–0.85 | 0.65 | How far blobs extend from center |
| **Spread** | 0–1 | 0.45 | Width of petal blobs (narrow ↔ fat) |
| **Tempo** | 0.25–3 | 1 | Loop speed multiplier |
| **Pulse** | 0–1 | 0.5 | Burst overshoot intensity during transitions |

*Note: For MVP, petal count is global. Per-state count (with split/merge) is a v2 feature once the core loop feels right.*

---

## UI Shell

Borrow Mantle Creep's shell:

- `body`: `background: #EAE4D8` (cream — **not dark**), IBM Plex Mono, `overflow: hidden`
- Full-viewport canvas
- Five draggable `.ctrl` cards
- `#reg-marks`: corner registration marks
- `#spine`: vertical left-edge label — `watercolor · radial · loop`
- Minimal status display (phase name or fps, small, muted)

No info box, no tooltips, no palette swatches, no model tabs — MVP only.

---

## Key Implementation Challenges

**1. Blob-based rendering (not bezier paths)**
Each "petal" is a radial gradient ellipse drawn with `ctx.createRadialGradient`. The key is getting the aspect ratio and positioning of each ellipse right — petal blobs should be ~2–3x taller than wide (elongated radially). Gap blobs should be ~1.5x wider than tall.

**2. Single blur pass doing the heavy lifting**
Apply `ctx.filter = 'blur(Xpx)'` to the offscreen canvas before compositing. Tune the blur radius — too little and it looks sharp/digital; too much and it loses all petal structure. The sweet spot is where you can still read the ray pattern but no edges are visible.

**3. The burst/settle easing**
The transition pulse (coil → burst → settle) is what gives the piece its energy. The overshoot amount (controlled by the `Pulse` slider) is critical. Write a custom easing function that takes a 0→1 progress value and maps it through: slight dip → overshoot peak → elastic settle.

**4. Seeded per-cycle variation**
Blob size and position jitter derive from the seeded PRNG. Change the seed each loop iteration so the flower looks slightly different each time, but stable within a cycle.

**5. State capture UI (future)**
For MVP, states A/B/C can be hardcoded. The UI for "capture current slider state as A/B/C" is a v2 feature — but design the data structure for states from the start so it's easy to add.

---

## File Deliverable

`index.html` — single file, inline everything. Opens in any modern browser, no server required.
