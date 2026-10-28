/**
 * `Resource`: a Command is typed by the lazy service it reads, and a lazy
 * entry provides only the service its tag names.
 */
import { Context, Effect, Layer } from 'effect'
import { expectTypeOf } from 'vitest'
import { Resource } from '../src/index.js'

class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => string }>()(
  'types/Greeter',
) {}
class Clock extends Context.Service<Clock, { readonly now: () => number }>()('types/Clock') {}
class Locale extends Context.Service<Locale, string>()('types/Locale') {}

const greeter = Layer.succeed(Greeter, { greet: (name: string) => name })

expectTypeOf(Resource.get(Greeter)).toEqualTypeOf<
  Effect.Effect<
    { readonly greet: (name: string) => string },
    Resource.LoadError,
    Resource.Lazy<Greeter>
  >
>()
expectTypeOf(Resource.prefetch(Greeter)).toEqualTypeOf<
  Effect.Effect<void, never, Resource.Lazy<Greeter>>
>()

// What the loaded Layer needs, the entry needs from the rest of `resources`.
const located = Layer.effect(
  Greeter,
  Effect.map(Locale, locale => ({ greet: (name: string) => `${locale}: ${name}` })),
)
expectTypeOf(Resource.lazy(Greeter, async () => located)).toEqualTypeOf<
  Layer.Layer<Resource.Lazy<Greeter>, never, Locale>
>()

const lazyGreeter = Resource.lazy(Greeter, async () => greeter)

// The entry satisfies a Command reading the lazy service...
expectTypeOf(Effect.provide(Resource.get(Greeter), lazyGreeter)).toEqualTypeOf<
  Effect.Effect<{ readonly greet: (name: string) => string }, Resource.LoadError>
>()
// ...and not one reading it eagerly: the service itself is not in the context until loaded.
expectTypeOf(Effect.provide(Greeter, lazyGreeter)).toEqualTypeOf<
  Effect.Effect<{ readonly greet: (name: string) => string }, never, Greeter>
>()
// An eager Layer does not stand in for a lazy one.
expectTypeOf(Effect.provide(Resource.get(Greeter), greeter)).toEqualTypeOf<
  Effect.Effect<
    { readonly greet: (name: string) => string },
    Resource.LoadError,
    Resource.Lazy<Greeter>
  >
>()
// Another service's lazy entry does not satisfy it.
expectTypeOf(
  Effect.provide(
    Resource.get(Greeter),
    Resource.lazy(Clock, async () => Layer.succeed(Clock, { now: () => 0 })),
  ),
).toEqualTypeOf<
  Effect.Effect<
    { readonly greet: (name: string) => string },
    Resource.LoadError,
    Resource.Lazy<Greeter>
  >
>()

// The chunk must build the service the tag names.
// @ts-expect-error a Layer of Clock is not Greeter's
Resource.lazy(Greeter, async () => Layer.succeed(Clock, { now: () => 0 }))

// A Layer whose build can fail must say what that means first (`Layer.orDie`).
// @ts-expect-error a failing Layer is refused
Resource.lazy(Greeter, async () => Layer.effect(Greeter, Effect.fail('offline' as const)))
