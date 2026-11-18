# Traps: Effect 4, not 3

Read before writing Effect code from memory, bumping Effect, or using a renamed or removed API.

The workspace runs `effect@^4.1.0`, one copy of each Effect package
(`pnpm-workspace.yaml` holds the platform and SQLite packages there), and
published packages peer on `^4.1.0`; Foldkit 0.170 peers on `~4.1.0`. 4.1
replaced `effect/Crypto` with `effect/crypto`: a UUID is `yield*
SecureRandom.SecureRandom` then `secureRandom.uuidV4()`, which cannot fail,
provided by `BrowserCrypto.layerSecureRandom`; and every `KeyValueStore.make`
must give `keys`. 4.1 also starts a `Stream.callback`'s setup when the stream
starts, before its first pull: a Mount's acquire runs even when the element
leaves in the same tick, and an asynchronous acquire then finishes before its
release runs, unless `Effect.acquireRelease` is given `{ interruptible: true }`
(then an interrupted acquire registers no release). The new timing moved two
things here: `Sync.mount`'s first replica status arrived after a dispatch, so
an install that replays edits must count them as edits since install, and
Measure's first write landed before its first size observations, so a test
waiting for it saw the Mount still busy. Since 4.0.0 there is no
`effect/unstable/*`: import `effect/http`, `effect/persistence`, `effect/rpc`,
`effect/sql` (and `effect/http-api` for the old `httpapi`). Since 4.0.0
`Array`, `Chunk`, `Effect` and `Record` `partition` and `Option.partitionMap`
return successes first, so a call site written for the rc type-checks and
swaps its results. Names that moved, each found the slow way:
`Effect.either` -> `Effect.result`, `Effect.async` -> `Effect.callback`,
`Effect.timeoutFail` -> `Effect.timeoutOrElse`, `Duration.decodeUnknown` ->
`Duration.fromInputUnsafe`, `Schema.OptionFromSelf` -> `Schema.Option`,
`Stream.mapBoth`'s callbacks -> `onElement`/`onError`. Since rc.116 `Stream.scan`
and `Stream.mapAccum` take their seed as a thunk; a plain value type-checks
against `LazyArg<unknown>` and fails at runtime with "initial is not a
function". `Schema.Union` and `Schema.Literals` take an array
(`Union([a, b])`, `Literals(['x', 'y'])`), not variadics; the variadic call
fails at the type level, not silently. Check the installed `.d.ts` before reaching for a remembered API.

A checked schema resolves to its **last check's** annotations, which carry
what the check expects and no `title`: `Schema.String.annotate({ title })
.check(…)` resolved directly has lost its title, and a check that set `title`
of its own named a form field "fits the Catalog". Read words with
`Words.of(schema)` from `foldkit-entity`, never `resolveAnnotations(…)?.title`.


