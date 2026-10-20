// @vitest-environment jsdom
/**
 * A reader's knobs: chosen through a Command, kept in storage, and applied by
 * the head script on the next visit before anything draws, to one rule both
 * write.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseKnobs, KNOBS_FORMAT, KNOBS_KEY, knobScript, Theme } from '../src/theme.js'

const base = Theme.make({})
const dense = Theme.make({ shape: { density: 1.2 } })

/** The head script as the browser runs it: its text, evaluated. */
const runHead = (place?: Parameters<typeof knobScript>[0]) => new Function(knobScript(place))()

const kept = (declarations: ReadonlyArray<readonly [string, string]>, v = KNOBS_FORMAT) =>
  JSON.stringify({ v, d: declarations })

/** The managed rules' declarations, by selector. */
const rules = () =>
  Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-fk-knobs]'), element => {
    const rule = element.sheet!.cssRules[0] as CSSStyleRule
    return {
      selector: rule.selectorText,
      density: rule.style.getPropertyValue('--fk-knob-density'),
      length: rule.style.length,
    }
  })

afterEach(() => {
  localStorage.clear()
  document.head.replaceChildren()
  vi.restoreAllMocks()
})

describe('the head script', () => {
  it('applies kept knobs to its selector', () => {
    localStorage.setItem(KNOBS_KEY, kept([['--fk-knob-density', '1.2']]))
    runHead({ selector: '[data-size]' })
    expect(rules()).toEqual([{ selector: '[data-size]', density: '1.2', length: 1 }])
  })

  it.each([
    ['nothing kept', null],
    ['an older format', kept([['--fk-knob-density', '1.2']], KNOBS_FORMAT - 1)],
    ['no declarations', JSON.stringify({ v: KNOBS_FORMAT })],
    ['text that is not JSON', '{'],
  ])('applies nothing for %s', (_, entry) => {
    if (entry !== null) localStorage.setItem(KNOBS_KEY, entry)
    expect(() => runHead()).not.toThrow()
    expect(rules()).toEqual([])
  })

  it('keeps only knob variables, whatever else the entry holds', () => {
    localStorage.setItem(
      KNOBS_KEY,
      kept([
        ['color', 'red'],
        ['--fk-color-ink', 'red'],
        ['--fk-knob-density', '1.2'],
      ]),
    )
    runHead()
    expect(rules()).toEqual([{ selector: ':root', density: '1.2', length: 1 }])
  })

  it('reads its own key, and a key or selector cannot close the script it is written in', () => {
    const key = 'app</script><script>alert(1)'
    localStorage.setItem(key, kept([['--fk-knob-density', '1.2']]))
    const script = knobScript({ key, selector: '[data-x="</script>"]' })
    expect(script).not.toContain('<')
    runHead({ key })
    expect(rules()[0]?.density).toBe('1.2')
  })

  it('applies nothing where storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => runHead()).not.toThrow()
    expect(rules()).toEqual([])
  })
})

describe('chooseKnobs', () => {
  it("rewrites the script's rule, and keeps what it wrote for the next visit", () => {
    localStorage.setItem(KNOBS_KEY, kept([['--fk-knob-density', '0.8']]))
    runHead()
    Effect.runSync(chooseKnobs(dense, { base }))
    // One element: the script's, rewritten.
    expect(rules()).toEqual([{ selector: ':root', density: '1.2', length: 1 }])
    document.head.replaceChildren()
    runHead()
    expect(rules()).toEqual([{ selector: ':root', density: '1.2', length: 1 }])
  })

  it('writes and keeps nothing for the base theme', () => {
    Effect.runSync(chooseKnobs(dense, { base }))
    Effect.runSync(chooseKnobs(base, { base }))
    expect(rules()).toEqual([{ selector: ':root', density: '', length: 0 }])
    expect(localStorage.getItem(KNOBS_KEY)).toBeNull()
  })

  it('keeps one rule per key', () => {
    Effect.runSync(chooseKnobs(dense, { base, key: 'a', selector: '.a' }))
    Effect.runSync(chooseKnobs(dense, { base, key: 'b', selector: '.b' }))
    expect(rules().map(rule => rule.selector)).toEqual(['.a', '.b'])
  })

  it('still applies the knobs to this page where storage refuses them', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    Effect.runSync(chooseKnobs(dense, { base }))
    expect(rules()[0]?.density).toBe('1.2')
  })
})
