// @vitest-environment jsdom
/**
 * A reader's named theme: chosen through a Command, kept in storage, and shown
 * by the head script on the next visit before anything draws, on the
 * attribute `Themes.apply` writes.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Theme, THEME_KEY, Themes } from '../src/theme.js'

const themes = Themes.make(
  { round: Theme.make({}), square: Theme.make({ shape: { radius: 0 } }) },
  { initial: 'round' },
)

/** The head script as the browser runs it: its text, evaluated. */
const runHead = (key?: string) => new Function(Themes.script(themes, key))()

const shown = () => document.documentElement.getAttribute('data-theme')

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('the head script', () => {
  it('shows a kept theme', () => {
    localStorage.setItem(THEME_KEY, 'square')
    runHead()
    expect(shown()).toBe('square')
  })

  it.each([
    ['nothing kept', null],
    ['the initial theme', 'round'],
    ['a name no theme has', 'oval'],
  ])('shows the initial theme for %s', (_, kept) => {
    if (kept !== null) localStorage.setItem(THEME_KEY, kept)
    runHead()
    expect(shown()).toBeNull()
  })

  it('reads its own key, and a key cannot close the script it is written in', () => {
    const key = 'app</script><script>alert(1)'
    localStorage.setItem(key, 'square')
    expect(Themes.script(themes, key)).not.toContain('<')
    runHead(key)
    expect(shown()).toBe('square')
  })

  it('shows the initial theme where storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => runHead()).not.toThrow()
    expect(shown()).toBeNull()
  })
})

describe('Themes.choose', () => {
  it('shows and keeps a theme, and the initial one removes both', () => {
    Effect.runSync(Themes.choose(themes, 'square'))
    expect(shown()).toBe('square')
    expect(localStorage.getItem(THEME_KEY)).toBe('square')
    Effect.runSync(Themes.choose(themes, 'round'))
    expect(shown()).toBeNull()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('still shows the theme on this page where storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    Effect.runSync(Themes.choose(themes, 'square'))
    expect(shown()).toBe('square')
  })
})
