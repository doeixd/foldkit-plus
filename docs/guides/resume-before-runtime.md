# Make a page answer before the framework loads

A server-rendered page looks ready immediately, but clicking a button before the JavaScript bundle finishes loading either does nothing or triggers a full-page reload. `foldkit-ssr/binder` listens on the served HTML, runs declared transitions over the resume envelope, updates anchored DOM elements in place, and hands its updated state to `SSR.hydrate` without rebuilding the page.

## Example

Declare typed anchor bindings with `Binding.define`, mark the HTML with `data-fk-anchor` and `data-fk-msg`, and start the binder in your browser entry:

```ts
import { Schema } from 'effect'
import { Path, Transition } from '@doeixd/metakit'
import { Binder, Binding } from 'foldkit-ssr/binder'

const State = Schema.Struct({ count: Schema.Int })
const $ = Path.forSchema(State)
const bindings = Binding.define<typeof State.Type>({
  'cart-count': Binding.text($.count),
})

Binder.start({
  manifest: { transitions: { Added: { tag: 'Added', schema: Schema.Struct({}), transition: addOne } }, bindings },
  envelope: { model: { count: 0 } },
  wake: () => import('./entry.js').then(() => undefined),
  idleWake: true,
})
```

Before `./entry.js` finishes downloading, clicking an element with `data-fk-msg="Added"` runs `addOne` and updates `[data-fk-anchor="cart-count"]` as text. When `./entry.js` calls `SSR.hydrate`, it claims the binder's updated state, merges it onto the resumed Model, drains any queued Messages in order, and adopts the served DOM with zero rebuilt elements.

## What the binder answers locally

The binder answers a press immediately only when:
1. Its payload decodes cleanly against its `Schema` (invalid payloads are dropped and logged).
2. Its transition emits no Commands.
3. Every path the transition writes is covered by a declared binding.

Any other press queues the decoded Message and calls `wake()` to load the full runtime.

## Leave unchanging data out of the envelope

On the server, `liveSet(plan, graph)` computes which Model paths the page's bound Messages can actually change. Static regions marked with `SSR.static` are drawn into HTML on the server and omitted from the client envelope (`checkStaticRegion` refuses any interactive binding inside a static region with `BindingInStaticRegion`).

## Next

- Split individual Message transitions into lazy chunks: [Cut script by Message](./cut-script-by-message.md).
- Working example: [`examples/foldkit/domains-plus/src/client/binder.ts`](../../examples/foldkit/domains-plus/src/client/binder.ts).
