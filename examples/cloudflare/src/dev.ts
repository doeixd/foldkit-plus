/**
 * `pnpm dev`: the Worker on the local stack and the page on Vite at
 * `PAGE_ORIGIN`, the origin the Worker's auth trusts. The page reloads by
 * Vite; a change to anything the Worker bundles swaps the Worker in place,
 * keeping what D1, R2 and the Durable Object hold. Edit `wrangler.toml` and
 * restart: the stack reads it once.
 */
import { servePage } from './pageServer.js'
import { PAGE_ORIGIN, startStack } from './stack.js'

const stack = await startStack()
const page = await servePage(stack.origin, Number(new URL(PAGE_ORIGIN).port))

const time = () => new Date().toLocaleTimeString()

const stop = async (code: number) => {
  await page.close()
  await stack.stop()
  process.exit(code)
}

await stack.watch({
  onSwap: () => console.log(`${time()} worker reloaded`),
  onBuildError: message =>
    console.error(`${time()} worker not rebuilt, the last one runs:\n${message}`),
  onStopped: message => {
    console.error(`${time()} the worker did not start, and took the stack with it:\n${message}`)
    void stop(1)
  },
})

console.log(`page    ${PAGE_ORIGIN}`)
console.log(`worker  ${stack.origin}`)

process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
