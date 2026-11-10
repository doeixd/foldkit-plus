import { Host } from 'foldkit-host'

interface Env {
  readonly DB: object
  readonly ASSETS: Host.Assets
  readonly ORIGIN?: string
  readonly OTHER?: string
}

const assets = { at: '/assets/', binding: (env: Env) => env.ASSETS }

// Inside the routes, the origin variable is set; another optional one is not.
Host.routes({
  origin: 'ORIGIN',
  assets,
  routes: {
    '/remote': async (_request, env) => {
      const origin: string = env.ORIGIN
      // @ts-expect-error OTHER is still optional
      const other: string = env.OTHER
      return new Response(origin + other)
    },
  },
  otherwise: async (_request, env) => new Response(env.ORIGIN.toUpperCase()),
})

Host.routes({
  // @ts-expect-error the origin names a binding, not a string variable
  origin: 'DB',
  assets,
  routes: {},
  otherwise: async () => new Response(),
})

Host.routes({
  // @ts-expect-error the origin names no variable at all
  origin: 'HOST',
  assets,
  routes: {},
  otherwise: async () => new Response(),
})

// A handler taking the bindings alone, as `serveFetch` does, fits a route.
declare const serveFetch: (request: Request, env: Env) => Promise<Response>
Host.routes({ origin: 'ORIGIN', assets, routes: { '/remote': serveFetch }, otherwise: serveFetch })

// One that needs a binding Env lacks does not.
declare const needsKv: (request: Request, env: { readonly KV: object }) => Promise<Response>
Host.routes({
  origin: 'ORIGIN',
  assets,
  // @ts-expect-error Env holds no KV
  routes: { '/kv': needsKv },
  otherwise: serveFetch,
})

declare const env: Env
Host.node(serveFetch, { env, origin: 'ORIGIN' })
// @ts-expect-error a binding is no origin
Host.node(serveFetch, { env, origin: 'ASSETS' })

// `isolate` gives back what its build makes, awaited.
const shared = Host.isolate(
  (each: Env) => each.DB,
  async () => ({ services: 1 }),
)
export const services: Promise<{ services: number }> = shared(env)
