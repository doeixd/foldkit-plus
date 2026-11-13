// @vitest-environment jsdom
/**
 * What another tab chose, heard as a stream: the decoding of a `storage`
 * event into a theme or a scheme, and the reading of the client hint.
 */
import { Effect, Fiber, Option, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLOR_SCHEME_HINT_HEADERS,
  schemeChanges,
  schemeOfHint,
  SCHEME_KEY,
  Theme,
  THEME_KEY,
  Themes,
  type Scheme,
} from '../src/theme.js'

const themes = Themes.make(
  { round: Theme.make({}), square: Theme.make({ shape: { radius: 0 } }) },
  { initial: 'round' },
)

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** Runs `stream`, lets `act` fire events, and returns what it emitted. */
const heard = async <A>(stream: Stream.Stream<A>, act: () => void): Promise<ReadonlyArray<A>> => {
  const seen: Array<A> = []
  const fiber = Effect.runFork(
    Stream.runForEach(stream, value => Effect.sync(() => seen.push(value))),
  )
  await tick()
  act()
  await tick()
  await Effect.runPromise(Fiber.interrupt(fiber))
  return seen
}

const write = (key: string | null, newValue: string | null, area: Storage = localStorage) =>
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: area }))

afterEach(() => {
  localStorage.clear()
})

describe('Themes.changes', () => {
  it.each([
    ['a theme', 'square', 'square'],
    ['the initial theme', 'round', 'round'],
    ['a name no theme has', 'oval', 'round'],
    ['a removed key', null, 'round'],
  ])('reads %s', async (_, written, expected) => {
    expect(await heard(Themes.changes(themes), () => write(THEME_KEY, written))).toEqual([expected])
  })

  it('hears only its own key, in local storage', async () => {
    const seen = await heard(Themes.changes(themes, 'mine'), () => {
      write('other', 'square')
      write('mine', 'square', sessionStorage)
      write('mine', 'square')
    })
    expect(seen).toEqual(['square'])
  })

  it('reads a cleared storage as the initial theme', async () => {
    expect(await heard(Themes.changes(themes), () => write(null, null))).toEqual(['round'])
  })

  it('stops listening when the stream ends', async () => {
    const removed = vi.spyOn(window, 'removeEventListener')
    await heard(Themes.changes(themes), () => {})
    expect(removed).toHaveBeenCalledWith('storage', expect.any(Function))
    removed.mockRestore()
  })
})

describe('schemeChanges', () => {
  it.each<[string, string | null, Scheme]>([
    ['dark', 'dark', 'dark'],
    ['light', 'light', 'light'],
    ['a removed key', null, 'system'],
    ['anything else', 'only dark', 'system'],
    ['system written out', 'system', 'system'],
  ])('reads %s', async (_, written, expected) => {
    expect(await heard(schemeChanges(), () => write(SCHEME_KEY, written))).toEqual([expected])
  })
})

describe('schemeOfHint', () => {
  it.each([
    ['"dark"', Option.some('dark')],
    ['"light"', Option.some('light')],
    ['dark', Option.some('dark')],
    ['  "light" ', Option.some('light')],
    ['"no-preference"', Option.none()],
    ['"Dark"', Option.none()],
    ['""', Option.none()],
    ['', Option.none()],
    [null, Option.none()],
    [undefined, Option.none()],
  ])('reads %j', (header, expected) => {
    expect(schemeOfHint(header)).toEqual(expected)
  })

  it('names the headers a server sends to receive it', () => {
    expect(COLOR_SCHEME_HINT_HEADERS).toEqual({
      'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
      'Critical-CH': 'Sec-CH-Prefers-Color-Scheme',
      Vary: 'Sec-CH-Prefers-Color-Scheme',
    })
  })
})
