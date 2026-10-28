// @vitest-environment node
/**
 * `pnpm dev`'s lifecycle: the stack and the page stop once, however many
 * ways ask, a failure while starting stops what started, and a failure to
 * stop is reported rather than left unhandled.
 */
import { describe, expect, it } from 'vitest'
import { develop, type DevParts } from '../src/develop.js'

type Listener = Parameters<Awaited<ReturnType<DevParts['startStack']>>['watch']>[0]

/** Parts that record what happens to them; `fail` names the steps that reject. */
const parts = (fail: ReadonlyArray<'serve' | 'watch' | 'stop'> = []) => {
  const events: Array<string> = []
  const watching: Array<Listener> = []
  const failing = (step: (typeof fail)[number]) =>
    fail.includes(step) ? Promise.reject(new Error(`${step} failed`)) : Promise.resolve()
  const given: DevParts = {
    startStack: async () => ({
      origin: 'http://127.0.0.1:1',
      watch: async listener => {
        watching.push(listener)
        await failing('watch')
      },
      stop: async () => {
        events.push('stack stopped')
        await failing('stop')
      },
    }),
    servePage: async () => {
      await failing('serve')
      return { close: async () => void events.push('page closed') }
    },
    exit: code => void events.push(`exit ${code}`),
    log: () => {},
    // Without the time it starts with, which is in the locale's own spelling.
    error: line => void events.push(`error ${line.split('\n')[0]!.replace(/^[^a-z]*/, '')}`),
  }
  return { events, watching, given }
}

describe('develop', () => {
  it('stops once when the Worker did not start and the user then interrupts', async () => {
    const { events, watching, given } = parts()
    const stop = await develop(given)
    watching[0]!.onStopped('notAHandler')
    await stop(0)
    expect(events).toEqual([
      'error the worker did not start, and took the stack with it:',
      'page closed',
      'stack stopped',
      'exit 1',
    ])
  })

  it.each([
    ['the page does not serve', 'serve' as const, ['stack stopped', 'exit 1']],
    ['the watch does not start', 'watch' as const, ['page closed', 'stack stopped', 'exit 1']],
  ])('stops the stack when %s', async (_, step, expected) => {
    const { events, given } = parts([step])
    await expect(develop(given)).rejects.toThrow(`${step} failed`)
    expect(events).toEqual(expected)
  })

  it('reports a stack that does not stop, and exits with 1', async () => {
    const { events, given } = parts(['stop'])
    const stop = await develop(given)
    await stop(0)
    expect(events).toEqual([
      'page closed',
      'stack stopped',
      'error did not stop: stop failed',
      'exit 1',
    ])
  })
})
