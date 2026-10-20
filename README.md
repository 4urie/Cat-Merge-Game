# Cat Merge

A single-player cat merging game in a hand-drawn notebook. Built in the existing Next.js / TypeScript project with Phaser 3 and its bundled Matter.js engine.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. For production, run `npm run build` followed by `npm start`.

## Play

- Move the pointer or drag a finger to aim; release to drop.
- Keyboard: focus the play area, use left/right arrows to aim, and Space or Enter to drop.
- Two touching cats of the same tier merge into the next tier. A merge awards `2 ** resultingTier` points. Tier 10 is the final tier.
- The next-cat card shows the cat that moves into the aiming position after your current drop.
- New cats have a 1.6-second settling grace period. A cat remaining above the danger line for another 1.8 seconds ends the round.
- Help and restart dialogs pause physics and overflow timers.
- Best score and sound preference are saved only in LocalStorage. No account, backend, or network service is needed during play.

## Project map

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Game entry page |
| `app/components/CatMerge.tsx` | Responsive UI, dialogs, accessible controls, Phaser lifecycle |
| `app/game/CatScene.ts` | Texture loading, Matter boundaries, aiming, collisions, merges, scoring, overflow, synthesized audio |
| `app/game/bridge.ts` | Typed per-instance event bridge, tier names, radii, initial state |
| `app/globals.css` | Paper grid, sketch cards, responsive layout, local fonts |
| `app/layout.tsx` | Document metadata |
| `public/assets/cats/` | Ten cat PNGs served to the game; tiers 7 and 9 are losslessly re-encoded repairs |
| `source-assets/` | Byte-for-byte backups of the truncated tier 7 and 9 PNGs |
| `public/fonts/` | Self-hosted Lilita One and Patrick Hand, with SIL font licenses |
| `tests/game.spec.js` | Browser and physics regressions |

Phaser is dynamically imported in a client effect. Physics never runs in React, and React receives only discrete state changes. Each mount owns its bridge and canvas parent; cleanup destroys the game and listeners, including under Strict Mode.

The original repository contained the Next.js starter page and cat assets but no pre-existing game engine. Phaser and the scene were added in place without recreating the project. No Ball Merge reference screenshot was supplied; the interface follows the written brief.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The Playwright suite starts or reuses a development server on port 3000. It tests the actual Matter scene: asset decoding and transparency, singleton canvas, pointer and keyboard drops, next-preview accuracy, floor/wall collisions, merges, persistence, tier limits, overflow/restart, dialog focus/pause, and mobile touch/layout. A development-only property on the canvas mount allows controlled physics fixtures; it is omitted in production.

Screenshots are written to ignored `artifacts/`; failure traces are in ignored `test-results/`.

## Notes

- The original 1024px cat PNGs are loaded directly except tiers 7 and 9. Those two files were truncated and could render black in WebGL; their recoverable pixels were re-encoded as valid transparent PNGs at the same paths. Their original bytes are preserved in `source-assets/`.
- Audio starts after a user gesture, as required by browsers. Blocked LocalStorage does not prevent play, but prevents persistence.
- Browser automation covers Chromium and mobile viewport/touch emulation. Physical iOS and Android devices have not been tested.
