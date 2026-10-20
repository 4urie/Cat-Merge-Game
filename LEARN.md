# Learn with Cat Merge

Use this project to explore how a small browser game connects a React interface, a Phaser game loop, and Matter.js physics. You can run it locally, trace a cat from input to collision, then make one change at a time and observe what happens.

## Start here

Install the dependencies and start the development server:

```sh
npm install
npm run dev
```

Open <http://localhost:3000>, then try dropping cats, merging matching tiers, resizing the browser, pausing the game, and restarting it. The production build and browser checks are available with `npm run build` and `npm run test:e2e`.

## Follow the game flow

1. **The page creates the game.** In `app/components/CatMerge.tsx`, a React effect creates a `GameBridge`, loads Phaser, mounts the canvas, and watches the board size. Its cleanup destroys the game and disconnects the resize observer.
2. **The bridge carries small updates.** `app/game/bridge.ts` defines the game state and typed events. The interface sends events such as `drop` and `pause`; the scene sends back state updates for the score, next cat, and game status.
3. **The scene runs gameplay.** `app/game/CatScene.ts` loads textures in `preload`, creates the play area and input handlers in `create`, updates overflow conditions in `update`, and handles drops, collisions, merges, and restart.
4. **React displays the interface.** The scene publishes discrete state changes through the bridge. React uses them to update the score cards, next-cat preview, collection, and dialogs. It does not rerender on every physics frame.

## Explore a feature

### Cat size and game boundaries

Cat tiers and base radii live in `app/game/bridge.ts`. `CatScene` scales those radii when the board changes size, then sets each Matter circle and sprite size. The resize handler also rebuilds its cat lookup using the new Matter body IDs, so collisions keep working after a resize.

Try adjusting a tier radius, then check whether cats still fit inside the walls and merge cleanly. Resize the browser while cats are in the container to see the scene update.

### Drops, collisions, and merges

Follow `drop()` to see how the current cat is spawned and how the next preview is selected. `collide()` reserves matching pairs during a physics event; `update()` processes those pairs after the physics step. `merge()` removes the old cats, spawns the next tier, and awards points.

Try changing the score formula or drop delay. Then play several rounds to check that your change works for both a single merge and multiple pairs colliding at once.

### React controls and accessibility

The controls and dialogs are in `app/components/CatMerge.tsx`. Keyboard aim and drop events use the same bridge as pointer input. The help and restart dialogs pause physics and manage keyboard focus.

Try adding a small interface change, such as a new game status message. Keep gameplay actions in the scene and pass the display state through the bridge.

### The notebook look

The page layout and responsive styles are in `app/globals.css`. The board is sized by CSS; a `ResizeObserver` passes its real dimensions to Phaser, and Matter boundaries and cat bodies are recalculated to match.

Try changing the board size at desktop and mobile widths. Check that the canvas still fills the board, cats stay inside the walls, and the collection remains usable on a narrow screen.

## Verify your changes

Run the checks that match your change:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The browser tests cover texture loading, aiming and drops, physics boundaries, merges, persistence, pause and restart, responsive layouts, and resizing while cats are in play.

## Assets and licenses

The game source code is under the [MIT License](LICENSE). The fonts in `public/fonts/` have their own SIL Open Font License files. The cat PNGs in `public/assets/cats/` and backups in `source-assets/` are excluded from the MIT grant; check the applicable rights before reusing or redistributing them.
