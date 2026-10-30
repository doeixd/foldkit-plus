/**
 * What `pnpm dev` runs: the stack, the page in front of it, and the one way
 * the two end. What starts them and how the process exits are given, so a
 * test can drive it without a workerd.
 */
import { Option } from 'effect'
import type { CloudflareStack } from './stack.js'

export interface DevParts {
  readonly startStack: () => Promise<Pick<CloudflareStack, 'origin' | 'watch' | 'stop'>>
  readonly servePage: (worker: string) => Promise<{ readonly close: () => Promise<void> }>
  /** Called once, after the page and the stack have stopped. */
  readonly exit: (code: number) => void
  readonly log: (line: string) => void
  readonly error: (line: string) => void
}

const time = () => new Date().toLocaleTimeString()

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Starts the stack and the page and watches the Worker's sources. Resolves
 * to `stop`, which stops both and exits once however often it is called; a
 * failure to stop one is reported and exits with 1. A failure while starting
 * stops what started, then rejects.
 */
export const develop = async (parts: DevParts): Promise<(code: number) => Promise<void>> => {
  const stack = await parts.startStack()
  let page = Option.none<{ readonly close: () => Promise<void> }>()
  let stopping = Option.none<Promise<void>>()
  const stop = (code: number) =>
    Option.getOrElse(stopping, () => {
      const closing = Option.match(page, { onNone: () => [], onSome: page => [page.close()] })
      const once = Promise.allSettled([...closing, stack.stop()]).then(results => {
        const failures = results.flatMap(result =>
          result.status === 'rejected' ? [result.reason] : [],
        )
        for (const failure of failures) parts.error(`${time()} did not stop: ${errorText(failure)}`)
        parts.exit(failures.length > 0 ? 1 : code)
      })
      stopping = Option.some(once)
      return once
    })

  try {
    page = Option.some(await parts.servePage(stack.origin))
    await stack.watch({
      onSwap: () => parts.log(`${time()} worker reloaded`),
      onRefused: message =>
        parts.error(`${time()} worker not swapped in, the last one runs:\n${message}`),
      onStopped: message => {
        parts.error(`${time()} the swap took the stack down with it:\n${message}`)
        void stop(1)
      },
    })
  } catch (error) {
    await stop(1)
    throw error
  }
  parts.log(`worker  ${stack.origin}`)
  return stop
}
