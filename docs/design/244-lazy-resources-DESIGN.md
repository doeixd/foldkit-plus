# A service whose code loads on first use (#244)

Status: built (2026-10-27). `Resource.lazy`, `Resource.get` and
`Resource.prefetch` in `foldkit-bundle`; the auth example loads Yielded's
client that way, and `examples/auth/test/split.test.ts` keeps it in a chunk of
its own.

## The problem

Foldkit builds the runtime's `resources` Layer once, on the first Command or
Subscription, and provides the built Context to every Command after. The code
of every service in it is imported by the entry module, so it ships in the
chunk every page loads, even when only a sign-in uses it.

Yielded's browser client is that case: `Client.make(AuthApi, …)` and its
`layerFetch` bring Yielded's HTTP operation client, its contract and Effect's
`HttpClient` stack into the entry. Two Commands read it: sign in and sign out.

A Command can import the chunk itself
(`Effect.promise(() => import('./client.js'))`) and provide the service, but
then the service is outside `resources`: it is built per Command, no Layer
owns its lifetime, and a test can no longer swap it through the runtime.

## What Foldkit does today (0.169.0)

`runtime/resourceProvider.js`:

- `resources` is built with `Layer.buildWithScope(resources, runtimeScope)`,
  wrapped in `Effect.cached` and `Effect.uninterruptible`. The first Command
  or Subscription builds it; later ones share it; the runtime's scope
  releases it.
- Each Command's Effect gets the built Context with `Effect.provideContext`.
  `yield* Tag` then reads that Context, synchronously.
- `managedResources` are separate: a Ref per entry, acquired and released as
  the Model's requirements change, read through `ManagedResource.get`, which
  fails with `ResourceNotAvailable` while none is held.

So the build is already lazy in time, but not in code, and a service in the
Context is either there or not: nothing runs when a Command reads it.

## Options

1. **Make `yield* AppClient` itself load.** A Layer typed as providing
   `AppClient` that puts a loader in the Context instead, and a tag whose
   `asEffect` reads the loader. Rejected: `Effect.service(AppClient)`,
   `Context.get`, or `Layer.effect(X, AppClient)` would find nothing and die,
   so the Layer's type promises what only one reader keeps. A load that fails
   would also have to be a defect, since a Context read has no error channel.
2. **A proxy service** whose methods load the real one first. Rejected: it
   works only for services made of Effect-returning methods, needs their names
   at runtime (which live in the chunk), and breaks a service with symbol
   members (Yielded's client has one).
3. **A Model-driven Managed Resource** whose requirement is "the sign-in form
   is shown". Rejected: its lifetime follows the Model, so the client would be
   built again on each visit, and a sign-out offered on every page would keep
   it loaded on every page.
4. **An upstream Foldkit change** that resolves Context entries lazily.
   Rejected for now: Effect's Context has no asynchronous entry, so Foldkit
   would have to know at run time which services a Command reads, which only
   its type says.
5. **A lazy entry in `resources` with a typed accessor.** Chosen. The entry
   is a Layer; the Command says it reads the service lazily, and its type says
   so.

## The API

```ts
// app.ts, in the entry chunk: the service's type, no implementation.
import type * as Client from '@yielded/auth/Client'
import type { AuthApi } from './authApi.js'

export class AppClient extends Context.Service<
  AppClient,
  { readonly auth: Client.AuthClient<typeof AuthApi.actions> }
>()('example/Auth/AppClient') {}

export type Services = RemoteClient | Resource.Lazy<AppClient>

const SignOut = Command.define('SignOut', {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  execute: Effect.gen(function* () {
    const { auth } = yield* Resource.get(AppClient)
    yield* auth.signOut()
    return Message.SucceededSignOut()
  }).pipe(Effect.catch(() => Effect.succeed(Message.FailedSignOut({ reason: '…' })))),
})
```

```ts
// authClient.ts, its own chunk.
const Yielded = Client.make(AuthApi, { baseUrl: location.origin })
export const layer = Layer.effect(AppClient, Yielded).pipe(
  Layer.provide(Yielded.layerFetch),
  Layer.orDie,
)
```

```ts
// client.ts
resources: Layer.mergeAll(
  Remote.clientLayer(…),
  Resource.lazy(AppClient, () => import('./authClient.js').then(chunk => chunk.layer)),
),
```

- **`Resource.lazy(Tag, load)`** is a `Layer<Resource.Lazy<Tag>, never, RIn>`.
  Building it imports nothing; it puts a loader in the Context, keyed by the
  tag's key. `load` returns a `Layer<Tag, never, RIn>`; `RIn` is what the
  rest of `resources` gives it, as with any Layer.
- **`Resource.get(Tag)`** is `Effect<Shape, Resource.LoadError,
  Resource.Lazy<Tag>>`. The first one imports the chunk and builds its Layer;
  every later one, and every one asking while it loads, gets the same service.
- **`Resource.prefetch(Tag)`** is `Effect<void, never, Resource.Lazy<Tag>>`:
  it starts the load and returns at once.
- **`Resource.LoadError`** (`_tag: 'ResourceLoadError'`, with the tag's
  `resource` key and the import's `cause`).

## Ownership and lifetime

```text
resources Layer ─ built once into the runtime's scope (Foldkit)
  └─ Resource.lazy(Tag, load) ─ a loader: nothing imported yet
       └─ first Resource.get / prefetch ─ import() ─ Layer ─ buildWithScope(runtime scope)
            └─ every later get: the same service, released when the runtime is
```

The loaded Layer is built into the scope the `resources` Layer was built in,
which is Foldkit's runtime scope. It is not `Effect.provide`d per Command,
which would build and release it each time.

The load runs in a fiber forked into that scope, not in the asking Command,
so interrupting the Command that started it leaves it running for the
others. The check for a load in flight and the claim of a new one happen in
one synchronous step, so two Commands asking at once share one import.

## Failure

- **The import fails** (offline, a deploy that removed the chunk):
  `Resource.get` fails with `LoadError`, which the Command handles like its
  service's own failures. The auth example's sign-in says "Could not sign in.
  Try again." The failed load is forgotten before its waiters wake, so the
  next `get` imports again.
- **The loaded Layer dies:** the defect reaches every Command waiting on that
  load, and the load is forgotten too.
- **The loaded Layer can fail:** refused by the type. A failure the service
  can recover from is its to handle; one it cannot is a defect
  (`Layer.orDie`). Carrying the Layer's error type through `Lazy<Tag>` would
  make every `get` name it; no service here needs that.
- **`prefetch` fails:** nothing is reported, and the next `get` loads again
  and reports its own result.

## Prefetch

`prefetch` is an Effect, so it runs where the runtime provides `resources`:
in a Command or a Subscription. The auth example starts it from a
Subscription once the reader types an email, so a sign-in waits for no chunk
and needs no Message of its own:

```ts
authClient: entry(
  { signingIn: Schema.Boolean },
  {
    modelToDependencies: model => ({ signingIn: model.email !== '' }),
    dependenciesToStream: ({ signingIn }) =>
      signingIn ? Stream.drain(Stream.fromEffect(Resource.prefetch(AppClient))) : Stream.empty,
  },
),
```

A sign-out loads the chunk on the press. Link intent (#227) can start it
the same way, from the destination a reader points at.

## Tests

A test gives the same entry a fake: `Resource.lazy(AppClient, async () =>
Layer.succeed(AppClient, fake))`. An eager `Layer.succeed(AppClient, fake)`
does not satisfy `Resource.Lazy<AppClient>`, by design: what the Command
requires is the lazy entry.

## Where it lives

`foldkit-bundle`, as `Resource`, beside `Bundle.lazy`, which loads a bundle's
`update` and `view` on demand. Both answer "this code is not needed until a
reader does something", and the package's peers are Foldkit and Effect only.
No Foldkit change is needed: the seam is the `resources` Layer, which Foldkit
already builds once into its runtime scope.

## Measured

The auth example's browser entry (`src/client.ts`), built with Vite 8.3.5,
minified, on one tree, with the four changed files at their previous commit
for "before":

| | minified | gzipped |
| --- | --- | --- |
| entry chunk, before | 777,712 B | 248,034 B |
| entry chunk, after | 735,752 B | 234,950 B |
| `authClient` chunk, after | 47,316 B | 15,527 B |

The entry lost 41,960 B (13,084 B gzipped), about 5%. Two moves were needed:

- **The client.** `AppClient` was `Client.make(AuthApi, …)` in `app.ts`,
  which the entry imports, so the client's code was in the entry whatever
  the Commands did. It is now a `Context.Service` whose shape names Yielded's
  client by type only.
- **The contract.** `AuthApi = AuthContract.make(…)` sat in `domain.ts`,
  which the entry imports for `Me` and `Notes`. A module-level call is kept
  even when nothing reads its result, so Yielded's operations, sessions and
  password modules stayed in the entry until `AuthApi` moved to
  `authApi.ts`, which only the client's chunk and the server import.

`examples/auth/test/split.test.ts` builds the entry and checks that no
module of Yielded's client or contract is in it, and that the `authClient`
chunk holds them. Its mutations import the chunk statically, and re-export
the contract from `domain.ts`; both turn it red. A test's own Vite build
takes the mutation plugin (now `scripts/mutation-plugin.mjs`), so `pnpm
mutate` reaches it.

The e2e test checks the browser asks for `authClient.ts` only once the
reader types an email, and once only.

## Deferred

- **Other splits.** Rich text, the data grid and the Builder are
  page-specific; they are views and bundles, so `Bundle.lazy` covers them
  rather than `Resource`.
- **A size budget in CI** (#229, #241). `split.test.ts` checks which modules
  are in which chunk, not their size.
