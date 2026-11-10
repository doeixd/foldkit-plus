/**
 * A value built once per isolate. A Worker's isolate outlives its requests,
 * so what is the same for every reader (an auth library's services over the
 * database, the page template) is built on the first request that needs it
 * and shared after. It is keyed by a binding, weakly: Miniflare hands out new
 * bindings on every reload, and a value built over a poisoned one must go
 * with it rather than be served again.
 */

/**
 * The value `build` makes for the binding `key` reads from `env`, built on
 * the first call for that binding and shared by every later one. A build that
 * fails (throws, or rejects) is forgotten, so the next call builds again.
 *
 * What it builds must hold no principal: it is shared by every request the
 * isolate answers. Read who is asking per request.
 */
export const isolate = <Env, A>(
  key: (env: Env) => object,
  build: (env: Env) => A | Promise<A>,
): ((env: Env) => Promise<A>) => {
  const built = new WeakMap<object, Promise<A>>()
  return env => {
    const binding = key(env)
    const held = built.get(binding)
    if (held !== undefined) return held
    const value = new Promise<A>(resolve => resolve(build(env)))
    built.set(binding, value)
    value.catch(() => built.delete(binding))
    return value
  }
}
