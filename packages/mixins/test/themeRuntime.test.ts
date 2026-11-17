// @vitest-environment jsdom
/**
 * The theme functions over a bare `ThemeNames`, with no compiled themes: what
 * a page built without the style compiler imports. The compiled `Themes`
 * members are these same functions.
 */
import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { Theme, Themes } from '../src/theme.js'
import {
  applyTheme,
  chooseTheme,
  themeChanges,
  themeScript,
  THEME_KEY,
  type ThemeNames,
} from '../src/theme/runtime.js'

const names: ThemeNames<'soft' | 'hard'> = {
  names: ['soft', 'hard'],
  initial: 'soft',
  attribute: 'data-look',
}

const shown = () => document.documentElement.getAttribute('data-look')

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-look')
})

it('is what the compiled Themes members are', () => {
  expect(Themes.apply).toBe(applyTheme)
  expect(Themes.choose).toBe(chooseTheme)
  expect(Themes.script).toBe(themeScript)
})

it('shows, keeps and reads a theme by the attribute it was given', () => {
  Effect.runSync(chooseTheme(names, 'hard'))
  expect(shown()).toBe('hard')
  expect(localStorage.getItem(THEME_KEY)).toBe('hard')
  document.documentElement.removeAttribute('data-look')
  new Function(themeScript(names))()
  expect(shown()).toBe('hard')
  Effect.runSync(applyTheme(names, 'soft'))
  expect(shown()).toBeNull()
})

describe('a name kept in storage, which nothing validated', () => {
  it('leaves the initial theme in the head script', () => {
    localStorage.setItem(THEME_KEY, 'oval')
    new Function(themeScript(names))()
    expect(shown()).toBeNull()
  })

  it('reads as the initial theme in the stream', async () => {
    const seen: Array<string> = []
    const fiber = Effect.runFork(
      Stream.runForEach(themeChanges(names), name => Effect.sync(() => seen.push(name))),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_KEY, newValue: 'oval', storageArea: localStorage }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_KEY, newValue: 'hard', storageArea: localStorage }),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(seen).toEqual(['soft', 'hard'])
  })
})

it('has the compiled themes assignable to it', () => {
  const themes = Themes.make({ soft: Theme.make({}), hard: Theme.make({}) }, { initial: 'soft' })
  const asNames: ThemeNames<'soft' | 'hard'> = themes
  expect(asNames.attribute).toBe('data-theme')
})
