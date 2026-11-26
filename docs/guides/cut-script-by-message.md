# Cut script by Message

Bundling every transition into your initial script delays interactivity for features a visitor may never click. You can cut individual transitions or child machines into separate chunks that prefetch on intent (`pointerover`, `focusin`, `touchstart`, or idle) and load on demand.

## Example

Move a transition into its own file and register its loader in `Binder.start`'s `chunks` table:

```ts
import { Binder } from 'foldkit-ssr/binder'

Binder.start({
  manifest: { transitions: {}, bindings },
  chunks: {
    ClickedAddDomain: () =>
      import('./chunks/addDomain.js').then(mod => mod.makeAddDomainEntry(quotes)),
  },
  envelope: { model: { cart }, root },
  wake: () => import('./entry.js').then(() => undefined),
  idleWake: true,
})
```

When a visitor hovers or focuses the button, the binder prefetches `addDomain.js` (327 B brotli on `domains-plus`). If they click while the chunk is still downloading, the press is held up to 3 seconds (`chunkTimeoutMs`) and runs exactly once when the chunk arrives.

## What happens when a chunk fails to load

- **Inside a `<form>`:** the binder releases the held press to native browser `form.submit()`, so the server fallback handles it.
- **Outside a `<form>`:** the binder retries the import once; if the retry also fails, it sets `aria-disabled="true"` and `data-fk-chunk-failed="<tag>"` on the control and calls `onChunkFailed`.

## Take arms as chunks arrive in the runtime

After hydration, `Declared.of` accepts `lazyTags` for transitions whose code loads later. Messages for an unloaded tag wait in a FIFO queue until you call `declared.registerArm(tag, transition, commands)`, which installs the arm and returns the queued Messages to drain through `update`.

## Verify chunk homes with `Manifest`

Use `defineManifest` or `manifestPlugin` from `foldkit-ssr/vite` to map every Message tag to exactly one chunk. Missing or duplicate tags fail both TypeScript compilation and runtime validation.

## Next

- Wire a page onto the binder first: [Make a page answer before the framework loads](./resume-before-runtime.md).
- Working example: [`examples/foldkit/domains-plus/e2e/chunks.e2e.ts`](../../examples/foldkit/domains-plus/e2e/chunks.e2e.ts).
