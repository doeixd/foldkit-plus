# See what a Message can affect

When a field changes in a large application, it is hard to know which views, queries, or Commands depend on it. `Graph.of` builds one static dependency graph from your `Module` (your Surfaces and placements) and your `Machine`, so you can query every reader a Message reaches before the app runs.

## Example

Pass your application's `Module` and `Machine` to `Graph.of`, then ask `impactOf` which readers a Message tag can affect:

```ts
import { Graph } from 'foldkit-surface/graph'
import { machine, module } from './app'

const graph = Graph.of(module, { machine })
const affected = graph.impactOf('Inc')
```

`affected` lists every Surface, query, and Command edge reachable from the paths `Inc` writes. A Surface whose projection reads only unrelated fields is absent from `affected`, and `Writes.track` skips redrawing it when `Inc` runs.

## Find readers no Message can change

On a server-rendered page, some Surfaces only display static data. Call `deadReaders(graph, liveMessages)` (from `@doeixd/metakit/graph/prune`) to list every reader that no bound Message on the page can reach. `foldkit-ssr`'s `liveSet` uses this result to omit unchanging data from the resume envelope.

## Check for broken links at test time

Call `Graph.validate(graph)` in a unit test. It checks that every emitted Command maps to declared Messages, every `sends` target exists in the application's Message union, and every Surface write footprint matches its declared Machine.

## Next

- Declare your `update` so the graph can read its writes: [Declare your `update`](./declare-update.md).
- Omit unchanging data from SSR pages: [Make a page answer before the framework loads](./resume-before-runtime.md).
