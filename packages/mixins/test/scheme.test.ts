// @vitest-environment jsdom
/**
 * A reader's scheme: chosen through a Command, kept in storage, and applied
 * by the head script on the next visit before anything draws.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseScheme, currentScheme, SCHEME_KEY, schemeScript } from '../src/theme.js'

/** The head script as the browser runs it: its text, evaluated. */
const runHead = (key?: string) => new Function(schemeScript(key))()

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('the head script', () => {
  it.each(['light', 'dark'] as const)('applies a kept %s scheme', scheme => {
    localStorage.setItem(SCHEME_KEY, scheme)
    runHead()
    expect(document.documentElement.style.colorScheme).toBe(scheme)
    expect(currentScheme()).toBe(scheme)
  })

  it("leaves the stylesheet's choice for nothing kept, or anything else", () => {
    runHead()
    expect(currentScheme()).toBe('system')
    // Valid CSS, but not a choice this page offers.
    localStorage.setItem(SCHEME_KEY, 'only dark')
    runHead()
    expect(document.documentElement.getAttribute('style')).toBeNull()
  })

  it('reads its own key, and a key cannot close the script it is written in', () => {
    const key = 'app</script><script>alert(1)'
    localStorage.setItem(key, 'dark')
    expect(schemeScript(key)).not.toContain('<')
    runHead(key)
    expect(currentScheme()).toBe('dark')
  })

  it('applies nothing where storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(runHead).not.toThrow()
    expect(currentScheme()).toBe('system')
  })
})

describe('chooseScheme', () => {
  it('applies and keeps a scheme, and system removes both', () => {
    Effect.runSync(chooseScheme('dark'))
    expect(currentScheme()).toBe('dark')
    expect(localStorage.getItem(SCHEME_KEY)).toBe('dark')
    Effect.runSync(chooseScheme('system'))
    expect(currentScheme()).toBe('system')
    expect(localStorage.getItem(SCHEME_KEY)).toBeNull()
  })

  it('still applies the scheme to this page where storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    Effect.runSync(chooseScheme('light'))
    expect(currentScheme()).toBe('light')
  })
})
