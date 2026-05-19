# Orobrick — Asset Generation Guide

This site is wired up to **automatically swap** every Unsplash placeholder for your real,
locally-saved asset the moment you drop a file at the exact path listed below.
No code changes needed. Just save the file, refresh the browser.

The site looks at each `data-asset` path on page load. If the file exists locally,
it replaces the Unsplash placeholder. If not, the placeholder stays.

---

## 1. Hero — scroll-scrubbed video (Google Flow / Veo 3)

**Save to:** `assets/hero/orobrick-assembly.mp4`
**Format:** MP4 (H.264), 1920×1080 or higher, 6-10 seconds, **no audio needed**, ~10-20 MB target
**Behavior:** The video scrubs frame-by-frame as the user scrolls the hero. They control playback with their scroll wheel — exactly like Apple's iPhone product pages.

### Prompt to paste into Google Flow (Veo 3)

```
A premium cinematic architectural visualization of a modern luxury home interior
assembling itself in an exploded-view style. The camera holds a wide, slow,
slightly elevated angle on a softly lit minimalist space.

Begin: all interior elements float separately in midair against a warm, soft
off-white background — a wide oak hardwood floor panel, four off-white drywall
sections, a flat smooth ceiling, two large modern windows with brushed-bronze
frames, a soft warm-painted feature wall, a tall slim interior door in matte
charcoal, a row of handle-less custom white kitchen cabinets, a marble countertop
slab, a freestanding modern soaker bathtub, a floating walnut bathroom vanity,
soft thin brass baseboard trim, and a single brass pendant light.

Each part rotates gently as it floats, evenly spaced, organized like an
architect's exploded axonometric drawing — clean, premium, calm. Soft warm
key light from upper left, gentle cool fill from right.

Then: smoothly, in a single continuous shot, every piece glides along its
axis into perfect final position. Floor lays down, walls slide inward and
seat against the floor, ceiling lowers, windows lock into the side walls,
door slots into the front wall, kitchen cabinets settle along the back wall,
countertop drops onto cabinets, bathtub and vanity glide into the bath area,
pendant light descends from the ceiling.

End: a fully assembled, photo-real, warm modern luxury interior room. No people.
No text. No furniture beyond what is listed. Off-white walls, warm white oak
floor, soft warm light pouring in through windows. Cinematic depth of field,
ARRI Alexa look, neutral color grade with subtle gold undertones.

Style: photoreal, architectural, luxury interior design, calm, premium,
cinematic. No clutter. Empty fresh interior.

8 seconds. No camera motion (locked-off wide shot). No music. No text overlays.
```

### Notes on Veo 3 generation
- Render at 1080p or higher. Higher resolution = better scroll-scrub quality.
- Aim for **6-10 seconds** — long enough to feel cinematic, short enough to stay <20 MB.
- Generate **without audio** (or strip it later) — the page mutes it anyway.
- If Veo gives you the choice, pick **no camera motion** so the assembly reads cleanly.

### Optional: poster frame
Veo 3 will also export individual frames. Save the very last frame (fully
assembled room) as the hero poster image:

**Save to:** `assets/hero/orobrick-poster.jpg`

Then update one line in `index.html` (search for `poster="..."` on `#heroVideo`)
to point to `assets/hero/orobrick-poster.jpg`.

---

## 2. Gallery — 6 real interior photos (Nano Banana / Gemini 2.5 Flash Image)

**Format:** JPG, 1600×1200 or 1600×2000 portrait, ~300-500 KB after optimization
Drop each file at the exact path. The site auto-swaps the Unsplash placeholder.

| # | Save to                            | Subject              | Aspect       |
|---|------------------------------------|----------------------|--------------|
| 1 | `assets/gallery/flooring.jpg`      | Modern flooring      | 4:5 portrait |
| 2 | `assets/gallery/walls.jpg`         | Painted walls        | 4:3 landscape|
| 3 | `assets/gallery/kitchen.jpg`       | Kitchen cabinets     | 4:3 landscape|
| 4 | `assets/gallery/bathroom.jpg`      | Bathroom remodel     | 16:9 wide    |
| 5 | `assets/gallery/ceiling.jpg`       | Ceiling finish       | 4:3 landscape|
| 6 | `assets/gallery/doors.jpg`         | Door & window install| 4:5 portrait |

### Prompts to paste into Nano Banana (one at a time)

**1. Flooring — `assets/gallery/flooring.jpg`** (portrait 4:5)
```
Photoreal close-up of a freshly installed wide-plank white oak engineered
hardwood floor in a modern luxury home. Warm afternoon light from a window
casts a soft long shadow across the planks. Visible wood grain, matte
finish, perfectly aligned seams. Off-white baseboard trim along the bottom
edge of frame. No furniture. Empty pristine room. Cinematic, architectural,
luxury interior magazine quality. Neutral color grade with subtle warm
golden undertones. Vertical 4:5 composition.
```

**2. Painted walls — `assets/gallery/walls.jpg`** (landscape 4:3)
```
Photoreal interior of a modern luxury home, empty room corner, freshly
painted in a warm off-white neutral. Soft natural daylight from the left.
Clean crisp paint lines, perfectly smooth drywall, subtle texture, brass
floor outlet visible on white oak floor. No furniture, no art. Empty
pristine architectural space. Cinematic, soft shadows, premium interior
photography. Neutral warm color palette. Horizontal 4:3 composition.
```

**3. Kitchen cabinets — `assets/gallery/kitchen.jpg`** (landscape 4:3)
```
Photoreal close shot of a finished modern luxury kitchen — handle-less white
oak cabinetry with brushed brass hardware on the lower row and matte off-
white uppers, a thick honed quartz countertop, integrated under-cabinet
warm LED lighting, soft daylight from a tall window on the right. No
clutter, no food, empty counters. Premium architectural interior magazine
photography. Cinematic depth of field. Horizontal 4:3 composition.
```

**4. Bathroom remodel — `assets/gallery/bathroom.jpg`** (wide 16:9)
```
Photoreal wide shot of a remodeled luxury master bathroom. Freestanding
modern matte white soaker tub on a white oak floor, large format off-white
tile on the back wall, a floating walnut vanity with a single under-mount
sink and brushed brass faucet, a tall slim window letting in soft warm
morning light. Polished, calm, hotel-quality. No people, no toiletries.
Empty, freshly finished. Architectural luxury magazine photography.
Horizontal 16:9 cinematic composition.
```

**5. Ceiling finish — `assets/gallery/ceiling.jpg`** (landscape 4:3)
```
Photoreal upward-angled shot of a finished modern luxury ceiling — smooth
off-white painted drywall with a clean recessed cove around the perimeter,
a single brass pendant light hanging center frame casting a warm glow,
flush LED downlights set in a precise grid. Soft warm light. No furniture
visible. Premium architectural interior photography. Horizontal 4:3
composition. Calm, minimal, luxury.
```

**6. Door & window install — `assets/gallery/doors.jpg`** (portrait 4:5)
```
Photoreal portrait shot of a freshly installed tall slim modern interior
door, matte charcoal finish, brushed brass lever handle, perfectly square
in a crisp off-white wall with clean square casing trim. A large window
visible to the right letting in soft warm afternoon light onto white oak
flooring. Empty pristine interior. Architectural luxury magazine quality.
Vertical 4:5 composition. Cinematic, warm, neutral.
```

---

## 3. About visual — `assets/about/craft.jpg`

**Format:** JPG, ~1400×1750 portrait, ~300-500 KB

### Prompt
```
Photoreal close-up detail of beautifully finished interior craftsmanship —
a hand running along a perfect line of crown molding where it meets a
freshly painted off-white wall, or a brushed brass cabinet pull on
handle-less white oak cabinetry, in soft warm afternoon light. Calm,
hands-only, no face. Premium architectural detail photography. Magazine
quality. Vertical 4:5 composition. Neutral palette with warm golden
undertones.
```

---

## Workflow

1. Generate the **hero video** in Google Flow first (it's the biggest visual).
   Save as `assets/hero/orobrick-assembly.mp4`.
2. Generate the **6 gallery photos** in Nano Banana, save each to its exact path.
3. Generate the **about photo**, save to its path.
4. Refresh the browser. Everything swaps in automatically.
5. (Optional) Optimize with [Squoosh](https://squoosh.app) — JPGs to ~85% quality
   and MP4 with [HandBrake](https://handbrake.fr) for smaller file sizes.

---

## Quick test

To confirm an asset is in the right place, open in the browser:
- `http://localhost:5173/assets/hero/orobrick-assembly.mp4`
- `http://localhost:5173/assets/gallery/flooring.jpg`

If it loads, the site will use it. If you see "File not found," check the
exact filename and folder.

---

## File tree expected when everything's in place

```
D:\orobrick\
├── assets\
│   ├── hero\
│   │   ├── orobrick-assembly.mp4    ← Veo 3
│   │   └── orobrick-poster.jpg      ← optional, last frame of the video
│   ├── gallery\
│   │   ├── flooring.jpg             ← Nano Banana
│   │   ├── walls.jpg
│   │   ├── kitchen.jpg
│   │   ├── bathroom.jpg
│   │   ├── ceiling.jpg
│   │   └── doors.jpg
│   └── about\
│       └── craft.jpg                ← Nano Banana
├── index.html
├── styles.css
├── script.js
└── ASSETS.md  (this file)
```
