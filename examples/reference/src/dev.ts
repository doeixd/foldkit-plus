/**
 * `pnpm dev`: the page built once, and the Worker on the local stack at the
 * origin it prints. A change to anything the Worker bundles, or to
 * `wrangler.toml`, swaps it in place, keeping D1; a change to the page needs
 * `pnpm dev` again, since the Worker reads its template once per isolate.
 */
import { buildPage, startStack } from './stack.js'

await buildPage()
const stack = await startStack()
const time = () => new Date().toLocaleTimeString()

const stop = async (code: number) => {
  await stack.stop()
  process.exit(code)
}

await stack.watch({
  onSwap: () => console.log(`${time()} worker reloaded`),
  onRefused: message =>
    console.error(`${time()} worker not swapped in, the last one runs:\n${message}`),
  onStopped: message => {
    console.error(`${time()} the swap took the stack down with it:\n${message}`)
    void stop(1)
  },
})

console.log(`notebook  ${stack.origin}`)

process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
