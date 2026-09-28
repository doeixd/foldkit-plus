/**
 * `pnpm dev` serves the source; `pnpm start` (after `pnpm build`) serves
 * `dist/`. `PORT` (3000) and `ORIGIN` (`http://localhost:<port>`) configure it.
 */
import { Number, Option, String, pipe } from 'effect'
import { join } from 'node:path'

import { development, production, startServer } from './host.js'

const DEFAULT_PORT = 3000

const port = pipe(
  Option.fromUndefinedOr(process.env['PORT']),
  Option.flatMap(Number.parse),
  Option.filter(value => globalThis.Number.isSafeInteger(value) && value >= 0 && value <= 65535),
  Option.getOrElse(() => DEFAULT_PORT),
)

const origin = pipe(Option.fromUndefinedOr(process.env['ORIGIN']), Option.filter(String.isNonEmpty))

const server = await startServer({
  port,
  origin,
  assets: process.argv.includes('--production')
    ? production(join(import.meta.dirname, '../dist'))
    : development,
})
console.log(`serving on ${server.url}`)
