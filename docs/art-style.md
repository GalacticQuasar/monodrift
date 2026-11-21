# Art style guide

How visual assets (trees and campfires today; houses, rocks, signs, … later) are designed and
wired into Monodrift. Read this before adding or changing any sprite.

## The look

The game is deliberately minimal: light grey ground, a white road, a black car.
Scenery should add texture without competing with the road or the car.

| Rule | Value / where |
| --- | --- |
| Colour | **Grayscale only.** Use the tones in `COLORS` (`src/config.ts`); add new greys there rather than inline. Every colour exists twice, in `COLORS.light` and `COLORS.dark` (dark mode), and sprites are generated from the active palette, so give each new tone both values. Light: nothing darker than `treeOutline` (`#4d4d4d`), so the car (`#111`) stays the darkest thing on screen. Dark: the reverse; nothing lighter than the brightest tree tone (`#565656`), so the white car stays the lightest. **Exception: fire** is a light source, so flames (`flame`, `flameCore`) are brighter at night, but still below the car (`#f0f0f0`). **Exception: car colours** (Settings > Car, `CAR_COLORS`): the player picks a muted colour so players in a room are easy to tell apart; each has a light and a dark value. The scenery stays grayscale. |
| Projection | **3/4 view**: objects are seen from above and slightly in front, so they show a top and a front face (trees: canopy over a visible trunk). Pure top-down blobs read as rocks. |
| Light | From the **top-left**. Lit faces/caps toward the upper-left, darkest band toward the lower-right. |
| Outline | **1 px dark outline around the silhouette only.** No internal outlines between parts. |
| Shading | **Flat tone bands** (2–4 tones per object), no dithering, no gradients, no glossy highlights. A small light "cap" on lit bumps is fine. |
| Shadow | A soft flat ellipse at the object's base in `COLORS.treeShadow` (translucent black), **baked into the sprite**. |
| Scale | Art is authored at low resolution and drawn at `SCENERY.pixelScale` (3) screen px per art pixel. Trees are 7–15 art px across; keep new assets in the same pixel density (never mix scales). |
| Variety | Several variants per asset (different shapes from a seeded RNG, or a few hand-designed ones), placed in clumps with clearings, not evenly sprinkled. |

## What didn't work (don't repeat these)

These were all tried for the trees and rejected:

- **Dithered shading** (Bayer patterns between tones): at this size the dither
  bands formed "faces" — two dark dashes like eyes. Use flat bands.
- **Glossy highlight** (a lighter circle offset to the top-left): made objects
  look like bubbles or balls.
- **Outlines/dark crevices between overlapping parts** (e.g. each canopy lobe
  outlined): read as cabbages or roses. Outline the silhouette only.
- **Pure top-down canopy** (round blob, no trunk): read as pebbles/rocks.
- **Tight clumps** (up to 6 trees within ~34 px, canopies stacked on each
  other): each clump merged into one lumpy blob. Groups are now looser and trees
  in a cell keep their canopies apart (`SCENERY.treeSpacing`).
- **Soft colour (sage greens) with smooth vector circles**: didn't fit; the
  game wants grayscale pixel art.

## How sprites work in code

Files: `src/render/sprites.ts` (art), `src/render/scenery.ts` (placement),
`src/render/renderer.ts` (drawing).

1. **Generate** each sprite once per palette at art resolution into a small
   canvas: procedurally (`makeTree`) or from a `src/art` file (`spriteFromArt`),
   with its baked shadow. Record the anchor point (`cx`, `cy`: art px from the
   top-left to the object's anchor) and size. `buildSprites` lists them all;
   `SPRITES` says where each kind starts in that list.
2. **Pack** all sprites into one atlas pre-scaled to device pixels
   (`buildAtlas`, rebuilt only if the device scale changes), then swapped to an
   `ImageBitmap`. Drawing is a 1:1 copy from a single texture. Add new asset
   types to the same atlas rather than drawing from separate small canvases
   (that was the main cause of lag before).
3. **Place** objects on the seeded world grid (`generateCell`): deterministic
   per seed, so the same road always gets the same scenery.
4. **Keep them off the road** using the object's real extent: a pure "reach"
   (like `treeReach(R)`: canopy + trunk + shadow; for art files `artReach(art)`,
   the farthest painted pixel from the anchor), used for both road clearance and
   view padding. Never hand-tune a separate clearance number.
5. **Draw back to front by y** (3/4-view objects lower on screen overlap those
   above). `visible()` returns a nearly-sorted list; keep per-cell lists sorted.
6. **Draw with whole numbers only**, in device-pixel space
   (`drawTrees`): fractional arguments to canvas calls allocate garbage every
   frame and blur pixel art.

## Hand-drawn assets and the pixel editor

Procedural art (trees) lives in `sprites.ts`. Hand-drawn art (buildings,
campfires, the copper key) lives in `src/art/<name>.json`:

```json
{
  "palette": "scenery",
  "anchor": [7, 13],
  "pixels": ["..oooo..", ".o3344o.", "..."]
}
```

- Each row is a string, one character per pixel; `.` is transparent. The
  characters are the palette's tones (`src/art/palettes.ts`): `scenery` is
  `o` outline, `t` trunk, `1`–`4` dark → light, `s` shadow, `f`/`y` flame and
  flame core, all from `COLORS`
  (light and dark values). Add a palette there for anything new.
- `anchor` (optional) is the pixel to place the object by, usually its base centre.
- `artProblems()` / `artRuns()` in `src/lib/pixel-art.ts` validate an asset and
  split it into runs; `tests/pixel-art.test.ts` checks every file in `src/art/`.
- **Pixel editor:** `npm run dev`, then open `/tools/pixel-editor/` (add
  `?asset=<name>` to open one directly). It draws with the palette's tones,
  previews at game scale (3×) on ground and road in light and dark, and saves
  back to the JSON file. Keys: B pencil, E eraser (or right-click), G fill,
  I pick (or Alt+click), A anchor, M mirror, 0–9 tones, arrows shift, Ctrl+Z/S.
  It's served by the dev server only and isn't part of the build.

## Campfires (the worked example)

- Art: `src/art/campfire-1..3.json`, the animation frames (same size and anchor,
  only the flames change).
- Placement (`generateCampfire` in `scenery.ts`, tuning in `CAMPFIRE` in
  `config.ts`): only deep in a forest (the cell and most of its neighbours dense),
  at most one per neighbourhood, near the road but clear of it. Trees keep out
  of a small clearing around it (`clearingRadius`, also in neighbouring cells:
  each cell's fire is worked out once and remembered), and a ring of trees is
  planted round the clearing, so the fire sits in a grove by the road rather
  than out in the open.
- **Animation:** a `Prop` has `sprite` (first frame), `frames` and a random
  `phase`; the renderer picks `sprite + (frame + phase) % frames` from the clock
  it's given, so neighbours don't flicker in sync. Nothing is allocated per frame.
- **Night glow:** `makeGlow` draws flat, stacked bands of `COLORS.dark.glow`
  (empty in light mode), two sizes alternating with the flames. The renderer
  draws glows on the ground and road, under the car, before the scenery layer.
- The Trees setting (and `?render=-trees`) hides all scenery, campfires included.

## Recipe: adding a new asset type (e.g. houses)

1. Add its tones to `COLORS` and its tuning (sizes, variants, density,
   distance from road) to config.
2. Draw the variants in the pixel editor (`src/art/house-*.json`, `scenery`
   palette, shadow baked in with `s`, anchor at the base centre). Hand-designed
   shapes suit buildings better than random lobes; keep the outline/light/
   flat-band rules.
3. In `sprites.ts`, import the files, push `spriteFromArt(art, colors)` for each
   in `buildSprites`, add their start index to `SPRITES`, and export their reach
   (`artReach`). Include it in `VIEW_PAD` in `scenery.ts`.
4. In `scenery.ts`, add placement rules (like `generateCampfire`): houses might
   sit at a set distance beside the road and avoid trees (`spacedOut`). Use the
   reach for clearance. Keep everything seeded from the run's seed.
5. Test: extend `tests/scenery.test.ts` (never on the road, same seed → same
   layout).

## Checking your work

- **Sprite sheet preview**: with `npm run dev` running, paste in the browser
  console to view every sprite at 8× (reload the page to get the game back):

  ```js
  const { buildSprites } = await import('/src/render/sprites.ts');
  const { COLORS } = await import('/src/config.ts');
  const sprites = buildSprites(COLORS.light); // or COLORS.dark
  const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  Object.assign(c.style, { position: 'fixed', inset: 0, zIndex: 99, background: '#e8e8e8' });
  document.body.append(c);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  sprites.forEach((s, i) => ctx.drawImage(s.image, 20 + (i % 5) * 160, 10 + Math.floor(i / 5) * 140, s.w * 8, s.h * 8));
  ```

- **In game**: look at it on the start screen and while driving, at phone
  width as well as desktop.
- **Performance**: open `/?debug`, drive for a minute, and check the report
  (fps, hitches, our JS per frame). `?debug&render=-trees` etc. switches layers
  off for comparison.
