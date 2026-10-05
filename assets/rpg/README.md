# Original game artwork and sound

## Visuals

- The active camp, characters, trees, buildings, objects, tactical board are original Canvas 2D game artwork in `js/engine/rpg_world.js`. The renderer reads existing engine state. Chapter-specific geometry in `rpg_maps.js` is applied to cloned app definitions; every originally walkable position and the common completion gate remain valid, while roads, landmarks, clue locations and optional interactions differ. Decisions, reflection requirements and attendance rules remain separate.
- `training-base.webp` and the four `portrait-*.webp` bust portraits are web-optimized original Google Flow / Nano Banana Pro outputs, generated for this project with user authorization after Imagen retirement. The training-base export was 2752×1536; portraits were 1024×1024, with flat ivory backgrounds (not transparency). Portraits appear in framed dialogue/party UI; the background is introductory art. Neither is described as a gameplay screenshot or as Imagen output. The original walking sprites remain programmatic and collision-aligned.
- Guardian Tales official store images were consulted only for visual reference: clear outlined chibi characters, layered environments, readable interaction markers and bright outdoor colors. No Guardian Tales character, logo, scene, image or music is included or traced.
- Existing fictional character identities remain: 恩禾、若嵐、明峻、以晴. The game does not use real military emblems.
- Chinese text uses available system fonts. No third-party font file is redistributed.

## Music

`assets/audio/morning-base.mp3` is based on original music generated in Google Flow Music using Lyria 3.5, titled 晨光基地・Morning Base. The prompt requested an original, warm military-medical academy exploration theme without vocals or an existing game/artist melody. The resulting 61.77-second source was edited into a 50.5-second crossfaded loop and normalized for quiet background use. It is loaded as a same-origin asset only after an ordinary user interaction.

If the local music file cannot be loaded or decoded, the existing original Web Audio melody remains a fallback. Muting, volume changes, background pausing and resuming apply to both. The menu, confirmation and clue cues (`menu.mp3`, `confirm.mp3`, `clue.mp3`) are edited excerpts of original Google Flow Music/Lyria 3.5 audio. They are loaded locally after interaction, use the same volume/mute controls, and fall back to original synthesized notes if unavailable. Audible speaker checks remain separate from source and lifecycle tests.

## Data and distribution

The public artifact contains only explicitly allowlisted game files. Source textbooks, student names, IDs, reflections, exported records, private worksheets, credentials and collector source code are excluded from the website build. The isolated `/preview/u03/` prototype uses its own device-local game, optional-challenge and receipt-outbox keys, and always disables classroom collection. Optional side stories, puzzles, collectibles and personal record boards never gate attendance or rank moral worth.
