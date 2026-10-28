/**
 * `Resource.lazy`: a service whose chunk loads on the first `get`, once,
 * built into the scope the `resources` Layer was built in, and retried after
 * a failed import.
 */
import { Context, Effect, Exit, Fiber, Layer, Scope } from 'effect'
import { describe, expect, it } from 'vitest'
import { Resource } from '../src/index.js'

class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => string }>()(
  'test/Greeter',
) {}

class Punctuation extends Context.Service<Punctuation, string>()('test/Punctuation') {}

const greeter = Layer.succeed(Greeter, { greet: name => `Hello, ${name}` })

/** A `load` the test settles, counting each import it was asked for. */
const controlled = <A>() => {
  const pending: Array<{ resolve: (value: A) => void; reject: (error: unknown) => void }> = []
  const load = () =>
    new Promise<A>((resolve, reject) => {
      pending.push({ resolve, reject })
    })
  const settle = (index: number) => {
    const entry = pending[index]
    if (entry === undefined) throw new Error(`no import ${index} was asked for`)
    return entry
  }
  return { load, pending, settle }
}

/** The `resources` Layer built into a scope the test closes, as Foldkit's runtime does. */
const built = async <A>(layer: Layer.Layer<A>) => {
  const scope = Scope.makeUnsafe()
  const context = await Effect.runPromise(Layer.buildWithScope(layer, scope))
  const run = <B, E>(effect: Effect.Effect<B, E, A>) =>
    Effect.runPromiseExit(Effect.provideContext(effect, context))
  const fork = <B, E>(effect: Effect.Effect<B, E, A>) =>
    Effect.runFork(Effect.provideContext(effect, context))
  return { run, fork, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
}

const greet = Effect.map(Resource.get(Greeter), service => service.greet('Ada'))

/** Lets the forked load and its waiters run. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

describe('Resource.lazy', () => {
  it('imports nothing until a Command asks', async () => {
    const { load, pending } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    expect(pending).toHaveLength(0)
    await runtime.close()
  })

  it('loads once for two Commands asking at the same time', async () => {
    const { load, pending, settle } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    const first = runtime.run(greet)
    const second = runtime.run(greet)
    await settled()
    expect(pending).toHaveLength(1)
    settle(0).resolve(greeter)
    expect(await first).toEqual(Exit.succeed('Hello, Ada'))
    expect(await second).toEqual(Exit.succeed('Hello, Ada'))
    // Loaded: a later Command asks for no import.
    expect(await runtime.run(greet)).toEqual(Exit.succeed('Hello, Ada'))
    expect(pending).toHaveLength(1)
    await runtime.close()
  })

  it('fails a Command with LoadError when the import fails, and tries again on the next', async () => {
    const { load, pending, settle } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    const failing = runtime.run(greet)
    await settled()
    const offline = new TypeError('Failed to fetch dynamically imported module')
    settle(0).reject(offline)
    expect(await failing).toEqual(
      Exit.fail(new Resource.LoadError({ resource: 'test/Greeter', cause: offline })),
    )
    const retried = runtime.run(greet)
    await settled()
    expect(pending).toHaveLength(2)
    settle(1).resolve(greeter)
    expect(await retried).toEqual(Exit.succeed('Hello, Ada'))
    await runtime.close()
  })

  it('reports a Layer that dies as a defect, and tries again on the next Command', async () => {
    let builds = 0
    const flaky = Layer.effect(
      Greeter,
      Effect.suspend(() => {
        builds += 1
        return builds === 1
          ? Effect.die('no network')
          : Effect.succeed({ greet: (name: string) => `Hi, ${name}` })
      }),
    )
    const runtime = await built(Resource.lazy(Greeter, async () => flaky))
    const first = await runtime.run(greet)
    expect(Exit.isFailure(first) && Exit.hasDies(first)).toBe(true)
    expect(await runtime.run(greet)).toEqual(Exit.succeed('Hi, Ada'))
    expect(builds).toBe(2)
    await runtime.close()
  })

  it('builds the service into the runtime scope, released when it closes, not when the Command ends', async () => {
    const events: Array<string> = []
    const scoped = Layer.effect(
      Greeter,
      Effect.acquireRelease(
        Effect.sync(() => {
          events.push('acquired')
          return { greet: (name: string) => `Hello, ${name}` }
        }),
        () => Effect.sync(() => events.push('released')),
      ),
    )
    const runtime = await built(Resource.lazy(Greeter, async () => scoped))
    expect(await runtime.run(greet)).toEqual(Exit.succeed('Hello, Ada'))
    expect(await runtime.run(greet)).toEqual(Exit.succeed('Hello, Ada'))
    expect(events).toEqual(['acquired'])
    await runtime.close()
    expect(events).toEqual(['acquired', 'released'])
  })

  it('keeps loading for the others when the Command that started it is interrupted', async () => {
    const { load, pending, settle } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    const starter = runtime.fork(greet)
    await settled()
    await Effect.runPromise(Fiber.interrupt(starter))
    const waiter = runtime.run(greet)
    settle(0).resolve(greeter)
    expect(await waiter).toEqual(Exit.succeed('Hello, Ada'))
    expect(pending).toHaveLength(1)
    await runtime.close()
  })

  it('builds the loaded Layer with the services the rest of `resources` gives', async () => {
    const punctuated = Layer.effect(
      Greeter,
      Effect.map(Punctuation, mark => ({ greet: (name: string) => `Hello, ${name}${mark}` })),
    )
    const runtime = await built(
      Resource.lazy(Greeter, async () => punctuated).pipe(
        Layer.provide(Layer.succeed(Punctuation, '!')),
      ),
    )
    expect(await runtime.run(greet)).toEqual(Exit.succeed('Hello, Ada!'))
    await runtime.close()
  })
})

describe('Resource.prefetch', () => {
  it('starts the import and returns before it lands; the get after waits for that one', async () => {
    const { load, pending, settle } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    expect(await runtime.run(Resource.prefetch(Greeter))).toEqual(Exit.void)
    await settled()
    expect(pending).toHaveLength(1)
    // Again while it loads: still one import.
    expect(await runtime.run(Resource.prefetch(Greeter))).toEqual(Exit.void)
    const asked = runtime.run(greet)
    settle(0).resolve(greeter)
    expect(await asked).toEqual(Exit.succeed('Hello, Ada'))
    expect(pending).toHaveLength(1)
    await runtime.close()
  })

  it('forgets a failed import, so the next get tries again', async () => {
    const { load, pending, settle } = controlled<Layer.Layer<Greeter>>()
    const runtime = await built(Resource.lazy(Greeter, load))
    expect(await runtime.run(Resource.prefetch(Greeter))).toEqual(Exit.void)
    await settled()
    settle(0).reject(new TypeError('offline'))
    await settled()
    const asked = runtime.run(greet)
    await settled()
    expect(pending).toHaveLength(2)
    settle(1).resolve(greeter)
    expect(await asked).toEqual(Exit.succeed('Hello, Ada'))
    await runtime.close()
  })
})
