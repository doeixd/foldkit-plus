# Snake

The classic game on a 20 by 20 board that wraps at the edges: steer with the
arrow keys or WASD, eat apples to grow and score 10 points, and the game
speeds up as the score rises. Space starts and pauses, R restarts, and running
into yourself ends the game. It ports Foldkit's
[`examples/snake`](https://github.com/foldkit/foldkit/tree/main/examples/snake)
to Foldkit Plus, with the same Model, Messages, `update`, Subscriptions and
game logic; the view is drawn through `foldkit-mixins` Slots instead of
Tailwind classes.

## Who owns what

The Model owns the whole game. The clock and the keyboard only report facts
as Messages, and Foldkit Plus owns nothing but the board's appearance:

```text
clock (interval from points) ─┐
keydown on document ──────────┴─> Message -> update -> Model -> view -> Slots <- Style (foldkit-mixins)
```

| Concern | Owner | Where |
| --- | --- | --- |
| Snake, apple, direction, game state, points, high score | the Model, plain Foldkit | `src/main.ts` |
| Movement, growth, wrapping, collisions, apple placement | upstream's pure domain modules, unchanged | `src/domain/`, `src/constants.ts` |
| The game clock, faster as the points rise | a plain Foldkit Subscription entry | `src/main.ts`, `// SUBSCRIPTION` |
| Keys, with the browser's scrolling cancelled | `Subscription.fromEventFilterMapPreventDefault` | `src/main.ts`, `// SUBSCRIPTION` |
| The page's and the board's Slots, layout and type | `foldkit-mixins` (`SlotView`, `Style`, `Layout`) | `src/style.ts` |
| Cell colors, one per `data-cell` value | `foldkit-mixins` `Style.states` over game tokens | `src/style.ts`, `// BOARD` |
| Drawing only the rows that changed | `foldkit-mixins` `slots.row.lazy` | `src/main.ts`, `// VIEW` |

## What is not used, and why

- **`foldkit-primitives` `Timer` / `Interval`** would own the tick, but both
  take a fixed `intervalMs` when placed, and the game's interval is derived
  from the points on every change. Each also keeps a `running` flag, which
  would be a second owner of what `gameState` already says. The upstream
  entry, whose dependencies are `{ isPlaying, interval }`, owns both in one
  place.
- **`foldkit-primitives` `keyboardEvents()`** cannot cancel the browser's
  default, and Space and the arrows would scroll the page. Its README sends
  that case to core `Subscription.fromEventFilterMap`, which is what upstream
  already uses.
- **`foldkit-mirror`**: upstream keeps the high score for the session only.
  Remembering it on the device would be a new feature, not a port.
- **`foldkit-mixins-ui`**: the game draws no `@foldkit/ui` component.
- **Surface, Remote, Sync, Agent, Bundle**: nothing is read from a server,
  replicated, exposed to an agent, or placed twice.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-snake dev
```

## How it is put together

- `src/main.ts` keeps upstream's sections and order. The view is two
  `SlotView`s: `Game` (the page) and `Board`. `Board` paints the board once
  per render into one line of text per row, and draws each row with
  `slots.row.lazy`. Text compares by value, so a tick draws again only the
  rows the snake and the apple changed. The first change after the page
  mounts still draws every row, because a row's memo learns which Slots it
  uses on its first draw.
- `src/style.ts` holds the appearance as data. The board's colors are the
  Tailwind shades upstream names, as `game` tokens; each cell's `data-cell`
  (`Empty`, `Head`, `Body`, `Apple`) picks one with `Style.states`. The sheet
  sets `color-scheme: dark`, since upstream's page is black in any browser.
- `src/entry.ts` installs the stylesheet and runs the application.

## Differences from upstream

- The keyboard Subscription reads `document` when it starts rather than when
  the module loads, so `main.ts` imports without a DOM. Upstream's tests ran
  under happy-dom, which hid this.
- `PausedGame` and `RestartedGame` are kept although nothing sends them, as
  upstream keeps them.

## Tests

From the repository root: `npx vitest run examples/foldkit-snake`.

- `test/story.test.ts` and `test/scene.test.ts` are upstream's tests, unchanged
  but for the import paths.
- `test/view.test.ts` draws the view inert: the title, every element in a
  Slot, the board's cells and which one wins where they overlap, each cell's
  color, and every token the drawn styles read defined in the stylesheet.
- `test/subscription.test.ts` runs the game clock under the TestClock (its
  interval at several scores, silence unless playing) and checks that the
  keyboard reports keys and cancels their default.
- `test/runtime.test.ts` runs the real runtime in jsdom: a tick draws only the
  row it changed, a moved apple draws two, and every class on the page has its
  CSS.
