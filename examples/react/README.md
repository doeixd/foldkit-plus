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

```bash
pnpm --filter foldkit-example-react demo
```

`test/demo.test.ts` pins the transcript. Everything is in
[`src/demo.ts`](src/demo.ts); [`src/dom.ts`](src/dom.ts) only sets up jsdom
for Node.
