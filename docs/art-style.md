# Art style guide

How visual assets (trees today; houses, rocks, signs, … later) are designed and
wired into Monodrift. Read this before adding or changing any sprite.

## The look

The game is deliberately minimal: light grey ground, a white road, a black car.
Scenery should add texture without competing with the road or the car.

| Rule | Value / where |
| --- | --- |
| Colour | **Grayscale only.** Use the tones in `COLORS` (`src/config.ts`); add new greys there rather than inline. Nothing darker than `treeOutline` (`#4d4d4d`) so the car (`#111`) stays the darkest thing on screen. |
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

1. **Generate** each variant once at startup at art resolution into a small
   canvas (`makeTree`), with its baked shadow. Record the anchor point
   (`cx`, `cy`: art px from the top-left to the object's centre) and size.
2. **Pack** all sprites into one atlas pre-scaled to device pixels
   (`buildAtlas`, rebuilt only if the device scale changes), then swapped to an
   `ImageBitmap`. Drawing is a 1:1 copy from a single texture. Add new asset
   types to the same atlas rather than drawing from separate small canvases
   (that was the main cause of lag before).
3. **Place** objects on the seeded world grid (`generateCell`): deterministic
   per seed, so the same road always gets the same scenery.
4. **Keep them off the road** using the object's real extent: export a pure
   "reach" function next to the art (like `treeReach(R)`: canopy + trunk +
   shadow, in art px) and use it for both road clearance and view padding.
   Never hand-tune a separate clearance number.
5. **Draw back to front by y** (3/4-view objects lower on screen overlap those
   above). `visible()` returns a nearly-sorted list; keep per-cell lists sorted.
6. **Draw with whole numbers only**, in device-pixel space
   (`drawTrees`): fractional arguments to canvas calls allocate garbage every
   frame and blur pixel art.

## Recipe: adding a new asset type (e.g. houses)

1. Add its tones to `COLORS` and its tuning (sizes, variants, density,
   distance from road) to config.
2. In `sprites.ts`, write `makeHouse(variant)` producing a sprite with a baked
   shadow and an anchor at the base centre, plus a pure `houseReach()`.
   Hand-designed shapes (a few variants) suit buildings better than random
   lobes; keep the outline/light/flat-band rules.
3. Pack the new sprites into the shared atlas (extend `buildTreeSprites` /
   `buildAtlas` to take all sprite kinds; give each object a sprite index).
4. In `scenery.ts`, add placement rules: houses might sit at a set distance
   beside the road, face it, and avoid trees. Use the reach function for
   clearance. Keep everything seeded from the run's seed.
5. Test: extend `tests/scenery.test.ts` (never on the road, same seed → same
   layout).

## Checking your work

- **Sprite sheet preview**: with `npm run dev` running, paste in the browser
  console to view every sprite at 8× (reload the page to get the game back):

  ```js
  const { buildTreeSprites } = await import('/src/render/sprites.ts');
  const sprites = buildTreeSprites();
  const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  Object.assign(c.style, { position: 'fixed', inset: 0, zIndex: 99, background: '#e8e8e8' });
  document.body.append(c);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  sprites.forEach((s, i) => ctx.drawImage(s.image, 20 + (i % 3) * 160, 10 + Math.floor(i / 3) * 140, s.w * 8, s.h * 8));
  ```

- **In game**: look at it on the start screen and while driving, at phone
  width as well as desktop.
- **Performance**: open `/?debug`, drive for a minute, and check the report
  (fps, hitches, our JS per frame). `?debug&render=-trees` etc. switches layers
  off for comparison.
