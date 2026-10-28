/**
 * `pnpm dev`: the Worker on the local stack and the page on Vite at
 * `PAGE_ORIGIN`, the origin the Worker's auth trusts. The page reloads by
 * Vite; a change to anything the Worker bundles swaps the Worker in place,
 * keeping what D1, R2 and the Durable Object hold. Edit `wrangler.toml` and
 * restart: the stack reads it once.
 */
import { develop } from './develop.js'
import { servePage } from './pageServer.js'
import { PAGE_ORIGIN, startStack } from './stack.js'

const stop = await develop({
  startStack,
  servePage: worker => servePage(worker, Number(new URL(PAGE_ORIGIN).port)),
  exit: code => process.exit(code),
  log: line => console.log(line),
  error: line => console.error(line),
})

console.log(`page    ${PAGE_ORIGIN}`)

process.once('SIGINT', () => void stop(0))
process.once('SIGTERM', () => void stop(0))
