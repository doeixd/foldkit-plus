/**
 * `pnpm start` (after `pnpm build`) serves `dist/`. `PORT` (3000) and `ORIGIN`
 * (`http://localhost:<port>`) configure it, and `FOLDKIT_BUILD_ID` names the
 * deployment, the same value `vite build` saw.
 */
import { NodeRuntime } from '@effect/platform-node'
import { Config, Effect, Layer, Option, String } from 'effect'
import { HttpServer } from 'effect/http'
import { join } from 'node:path'

import { host, production } from './host.js'

const PORT = Config.withDefault(Config.Port('PORT'), 3000)

const ORIGIN = Config.option(Config.String('ORIGIN')).pipe(
  Config.map(Option.filter(String.isNonEmpty)),
)

const Main = Layer.unwrap(
  Effect.gen(function* () {
    return host({
      port: yield* PORT,
      origin: yield* ORIGIN,
      assets: production(join(import.meta.dirname, '../dist')),
    })
  }),
).pipe(HttpServer.withLogAddress)

NodeRuntime.runMain(Layer.launch(Main))
