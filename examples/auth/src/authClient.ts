/**
 * Yielded's client as `AppClient`: a chunk of its own, which `client.ts`
 * imports on the first `Resource.get(AppClient)`. It talks over `fetch` to
 * this page's origin, which Vite proxies to the server; a sign-in's cookie
 * is set by the response, never read here.
 */
import * as Client from '@yielded/auth/Client'
import { Layer } from 'effect'
import { AppClient } from './app.js'
import { AuthApi } from './authApi.js'

const Yielded = Client.make(AuthApi, { baseUrl: location.origin })

// Its only failure is a `baseUrl` that is not a URL, which `location.origin` is.
export const layer = Layer.effect(AppClient, Yielded).pipe(
  Layer.provide(Yielded.layerFetch),
  Layer.orDie,
)
