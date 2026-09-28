# Counter

A number with three buttons: `-`, `Reset` and `+`. The page title follows the
count. It ports Foldkit's
[`examples/counter`](https://github.com/foldkit/foldkit/tree/main/examples/counter)
to Foldkit Plus, with the same Model, Messages and `update`; only the styling
changes, from Tailwind classes to `foldkit-mixins`.

## Who owns what

The count is the application's one fact, and the Model owns it. Foldkit Plus
owns nothing here but the view's appearance:

```text
click -> Message -> update -> Model { count } -> view -> Slots <- Style (foldkit-mixins)
```

| Concern | Owner | Where |
| --- | --- | --- |
| The count, the three Messages, `update` | plain Foldkit | `src/main.ts` |
| The accessible button (`type="button"`, the click) | `@foldkit/ui` Button | `src/main.ts` |
| The button's look: the shipped `Recipes.Button`, squared off | `foldkit-mixins-ui` | `src/style.ts` |
| The page's Slots, layout (`Layout.stack`, `Layout.cluster`) and type | `foldkit-mixins` | `src/style.ts` |
| Theme tokens, the layer order, body defaults | `foldkit-mixins` (`Theme`, `Layers`, `Defaults`) | `src/style.ts`, installed by `src/entry.ts` |

The app uses no Surface, Remote, Sync, Mirror or Agent: nothing here reads from
a server, persists, replicates or is exposed to an agent, and a Surface with no
consumer would only be ceremony. Reloading the page resets the count, as
upstream's does.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-counter dev
```

## How it is put together

- `src/main.ts` keeps upstream's sections: `MODEL`, `MESSAGE`, `UPDATE`,
  `INIT`, `VIEW`. The view is a `SlotView` over three Slots (`root`, `count`,
  `controls`) with `CounterStyle` attached; each button is `@foldkit/ui`'s
  `Button.view`, its attributes resolved against `ButtonSlots` by
  `foldkit-mixins-ui` so `ButtonStyle` applies.
- `src/style.ts` holds the appearance as data. The palette is `Theme.oklch`
  with a colorless, near-black accent, so the recipe's solid button is black on
  white. Every slot style is compiled into the `app` layer, so it overrides the
  recipe and the layouts by layer order.
- `src/entry.ts` installs `stylesheet` (the layer order, the tokens, the body
  defaults) and runs the application. The slot styles' classes are not in that
  sheet: `foldkit-mixins` injects each class's CSS when a Slot first draws it.
  The sheet sets `color-scheme: light`, so the page stays white in a dark
  browser, as upstream's does.

## Tests

From the repository root: `npx vitest run examples/foldkit-counter`.

- `test/story.test.ts` and `test/scene.test.ts` are upstream's tests, unchanged
  but for the import path.
- `test/view.test.ts` draws the view inert: the title, that every element is
  drawn by a Slot, that each button carries the Button recipe, and that the
  stylesheet defines every token the drawn styles read.
- `test/runtime.test.ts` runs the real runtime in jsdom: clicks count, the
  title follows, and every class on the page has its CSS.
