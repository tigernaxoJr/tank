# Credits

Third-party in-game art is from the following packs by **Kenney** ([kenney.nl](https://www.kenney.nl)), released under
[Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required, but it is given here with thanks.

| Pack | Source | Used for |
| :--- | :--- | :--- |
| Tank Pack (side view) | https://opengameart.org/content/tank-pack-80 | Crates and oil barrels (the tanks and shells are now original, see below) |
| Background Elements Redux | https://opengameart.org/content/background-elements-redux | Sun |
| Smoke Particle Assets | https://opengameart.org/content/smoke-particle-assets | Explosion, muzzle flash, white puff and black smoke frames |

Processed copies live in `public/assets/kenney/` and are produced by `tools/assets/bake_kenney_assets.py`
(see `docs/04-art-asset-pipeline.md`).

## Original art

All map themes (`harvest_farm`, `volcano_rift`, `tropic_coast`, `desert_temple`, `sky_meadow`, `aurora_night`,
`moon_ruins`), including the terrain tiles, parallax layers, props, bedrock textures, the hanging
decorations and the moon in `public/assets/maps/` are original to this project. They are drawn procedurally by
`tools/assets/paint_map_themes.mjs` (SVG sources in `tools/assets/map-art/`) and use no third-party images.

The tanks, barrels, projectiles and glow / spark / shockwave particles in `public/assets/units/` are original to this
project as well, drawn by `tools/assets/paint_units.mjs` (SVG sources in `tools/assets/unit-art/`).
