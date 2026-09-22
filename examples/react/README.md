# React interop example

Three ways Foldkit and React meet, run in jsdom and printed as a transcript:

- **A React component in a Foldkit view.** `StarRating` is an ordinary React
  component with its own `useState`. `ReactComponent.define` places it in a
  Foldkit view: a click becomes the `Rated` Message, a Model change re-renders
  the island without remounting it (its preview count survives a rename), and a
  `lazy` component shows its Suspense fallback until it loads.
- **A Foldkit program in a React app.** A counter built with
  `Runtime.makeElement` and Ports is wrapped by `FoldkitComponent.define`. The
  `step` prop flows in through an inbound Port, counts come back through an
  outbound Port to the latest `onCount` prop, and unmounting disposes the
  runtime.
- **A Foldkit view compiled to TSX.** `foldkit-react-codegen` prints the React
  version of a small card view, then refuses a view that uses `OnMount`.

## Run it

From the repository root (no browser window or server is needed):

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-react demo
```

`test/demo.test.ts` pins the transcript. Everything is in
[`src/demo.ts`](src/demo.ts); [`src/dom.ts`](src/dom.ts) only sets up jsdom
for Node.

## Follow one event

Start with `StarRating`, `ReactStarRating`, and `reviewView` in
[src/demo.ts](src/demo.ts), then read `reactInsideFoldkit`:

```text
React onRate(stars) → Rated Message → Foldkit update → model.stars → React props
```

The selected rating belongs to Foldkit. The preview count belongs to React.
Renaming the review changes props while preserving the preview count, proving
that a Model update does not remount the island.

For the reverse direction, follow the counter's Ports: a changed `step` prop
enters the embedded program; a count exits through the callback. Initial props
and live Port values have different lifecycles—changing initial configuration
does not itself rebuild a running program.

## Choose the mechanism to copy

| Need | Copy | Read next |
| --- | --- | --- |
| Use a React widget in a Foldkit screen | `ReactComponent.define` and its event mapping | [React bridge](../../packages/react/README.md#react-inside-foldkit) |
| Embed an existing Foldkit program | `FoldkitComponent.define` and Port bindings | [Foldkit inside React](../../packages/react/README.md#foldkit-inside-react) |
| Produce editable React rendering source | The `transformSourceFile` example | [Codegen](../../packages/react-codegen/README.md) |

Try increasing a preview count, then renaming the review. Predict which value
survives before reading the next transcript line. Codegen is a separate path:
it translates the view and does not carry the Foldkit runtime into React.
