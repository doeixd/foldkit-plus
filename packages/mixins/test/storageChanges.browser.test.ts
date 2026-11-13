/**
 * Another tab's choice, in a real browser: a document of the same origin
 * (an iframe stands in for a second tab) writes storage, and the `storage`
 * event reaches this page's stream; this page's own `choose` does not.
 */
import { Effect, Fiber, Stream } from 'effect'
import { afterEach, expect, test } from 'vitest'
import { chooseScheme, schemeChanges, Theme, THEME_KEY, Themes } from '../src/theme.js'

const themes = Themes.make(
  { round: Theme.make({}), square: Theme.make({ shape: { radius: 0 } }) },
  { initial: 'round' },
)

/** A second document of this origin, which shares `localStorage` with the page. */
const otherTab = () => {
  const frame = document.createElement('iframe')
  frame.srcdoc = '<!doctype html><title>other tab</title>'
  document.body.append(frame)
  return new Promise<Window>(resolve => {
    frame.addEventListener('load', () => {
      resolve(frame.contentWindow!)
    })
  })
}

/** Listens to `stream` while `act` runs, then lets pending events arrive. */
const heard = async <A>(stream: Stream.Stream<A>, act: () => void | Promise<void>) => {
  const seen: Array<A> = []
  const fiber = Effect.runFork(
    Stream.runForEach(stream, value => Effect.sync(() => seen.push(value))),
  )
  await new Promise(resolve => setTimeout(resolve, 50))
  await act()
  await new Promise(resolve => setTimeout(resolve, 200))
  await Effect.runPromise(Fiber.interrupt(fiber))
  return seen
}

afterEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
})

test('a write in another tab reaches this page, as the name this page decodes', async () => {
  const other = await otherTab()
  const seen = await heard(Themes.changes(themes), () => {
    other.localStorage.setItem(THEME_KEY, 'square')
    other.localStorage.setItem(THEME_KEY, 'oval')
    other.localStorage.removeItem(THEME_KEY)
  })
  expect(seen).toEqual(['square', 'round', 'round'])
})

test('the tab that writes hears nothing, for a theme or a scheme', async () => {
  await otherTab()
  const themed = await heard(Themes.changes(themes), () => {
    localStorage.setItem(THEME_KEY, 'square')
    Effect.runSync(Themes.choose(themes, 'round'))
  })
  expect(themed).toEqual([])
  const schemed = await heard(schemeChanges(), () => {
    Effect.runSync(chooseScheme('dark'))
  })
  expect(schemed).toEqual([])
  document.documentElement.removeAttribute('style')
})

test('a scheme another tab chose arrives as the scheme', async () => {
  const other = await otherTab()
  const seen = await heard(schemeChanges(), () => {
    other.localStorage.setItem('foldkit:color-scheme', 'dark')
    other.localStorage.removeItem('foldkit:color-scheme')
  })
  expect(seen).toEqual(['dark', 'system'])
})
