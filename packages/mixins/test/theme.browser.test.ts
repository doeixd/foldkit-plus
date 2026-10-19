/**
 * A theme's tints in a real browser, which does the color math: a tone's
 * `subtle` keeps the tone's hue over a tinted base. Mixed in OKLCH, a mix
 * mostly of a blue-grey base took the base's hue, so a success tint was blue.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, type Standard, type Values } from '../src/theme.js'

const theme = Theme.standard(
  Theme.make({ accent: { hue: 265, chroma: 0.16 }, surface: { saturation: 0.008 } }),
)
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** The hue of a computed color, in degrees: from OKLCH's `h`, or OKLab's `a` and `b`. */
const hueOf = (color: string): number => {
  const lch = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/.exec(color)
  if (lch !== null) return Number(lch[1])
  const lab = /^oklab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return ((Math.atan2(Number(lab[2]), Number(lab[1])) * 180) / Math.PI + 360) % 360
}
/** The chroma of a computed color: OKLCH's `c`, or the length of OKLab's `a` and `b`. */
const chromaOf = (color: string): number => {
  const lch = /^oklch\(\s*[\d.]+%?\s+([\d.]+)/.exec(color)
  if (lch !== null) return Number(lch[1])
  const lab = /^oklab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return Math.hypot(Number(lab[1]), Number(lab[2]))
}
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

/** The page's tokens in one scheme, installed. */
const install = (scheme: 'light' | 'dark') => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('tokens', Theme.root(Theme.tokens, { colorScheme: scheme })),
    L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: scheme })),
  )
  document.head.append(style)
}
/** A token as the browser computes it, as a background. */
const computed = (token: string) => {
  const swatch = document.createElement('div')
  swatch.style.background = `var(--fk-${token})`
  document.body.append(swatch)
  return getComputedStyle(swatch).backgroundColor
}
const lightnessOf = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the surface steps keep the base’s tint',
  scheme => {
    install(scheme)
    const base = computed('surface-base')
    for (const step of ['surface-muted', 'surface-subtle', 'surface-default'].map(computed)) {
      expect(distance(hueOf(step), hueOf(base)), step).toBeLessThan(10)
      // About the base's chroma: less reads grey on the page, more reads as
      // another, bluer color beside it (a sidebar against the page).
      expect(chromaOf(step) / chromaOf(base), step).toBeGreaterThan(0.9)
      expect(chromaOf(step) / chromaOf(base), step).toBeLessThan(1.35)
    }
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the field ground stands further off the base than the quieter tint',
  scheme => {
    install(scheme)
    const base = lightnessOf(computed('surface-base'))
    const field = Math.abs(lightnessOf(computed('surface-field')) - base)
    const subtle = Math.abs(lightnessOf(computed('surface-subtle')) - base)
    expect(field, scheme).toBeGreaterThan(0.015)
    expect(field, scheme).toBeGreaterThan(subtle)
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the outlines keep the base’s tint and step away from it',
  scheme => {
    install(scheme)
    const base = computed('surface-base')
    const lines = ['outline-subtle', 'outline-default', 'outline-overt'].map(computed)
    for (const line of lines) {
      expect(distance(hueOf(line), hueOf(base)), line).toBeLessThan(10)
      // A little more of the tint than the base, which a thin line needs to
      // read as the page's color; not so much it reads as another one.
      expect(chromaOf(line) / chromaOf(base), line).toBeGreaterThan(1.1)
      expect(chromaOf(line) / chromaOf(base), line).toBeLessThan(1.7)
    }
    const steps = lines.map(line => Math.abs(lightnessOf(line) - lightnessOf(base)))
    expect(steps[0]).toBeGreaterThan(0.04)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
  },
)

test.each([
  ['success', 145],
  ['warning', 75],
  ['error', 25],
])('the %s tint keeps its hue over a tinted base', (tone, hue) => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
    L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  )
  document.head.append(style)
  const swatch = document.createElement('div')
  swatch.style.background = `var(--fk-${tone}-subtle)`
  document.body.append(swatch)
  const color = getComputedStyle(swatch).backgroundColor
  expect(distance(hueOf(color), hue), color).toBeLessThan(20)
})

const families = ['accent', 'secondary', 'tertiary', 'success', 'warning', 'error', 'info']

test.each(['light', 'dark'] as const)(
  'in a %s scheme, every family is one shape, with a line that stands off the base',
  scheme => {
    install(scheme)
    const base = lightnessOf(computed('surface-base'))
    for (const family of families) {
      for (const member of ['default', 'hover', 'active', 'subtle', 'outline', 'on-fill', 'ink'])
        expect(computed(`${family}-${member}`), `${family}-${member}`).not.toBe('rgba(0, 0, 0, 0)')
      // Toward the side away from the page: darker on a light page, lighter on a dark one.
      const fill = lightnessOf(computed(`${family}-default`))
      const line = lightnessOf(computed(`${family}-outline`))
      expect(Math.abs(line - base), family).toBeGreaterThan(Math.abs(fill - base))
    }
  },
)

test('a feedback fill is lighter in a dark scheme, so it reads on a dark page', () => {
  install('light')
  const light = families.slice(3).map(family => lightnessOf(computed(`${family}-default`)))
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  install('dark')
  const dark = families.slice(3).map(family => lightnessOf(computed(`${family}-default`)))
  dark.forEach((value, index) => expect(value).toBeGreaterThan(light[index] ?? 1))
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, bedrock is darker than the base, and the focus ring is the accent',
  scheme => {
    install(scheme)
    expect(lightnessOf(computed('surface-bedrock'))).toBeLessThan(
      lightnessOf(computed('surface-base')),
    )
    expect(computed('outline-focus')).toBe(computed('accent-default'))
  },
)

test('the error fill keeps light text in a dark scheme', () => {
  install('dark')
  expect(lightnessOf(computed('error-on-fill'))).toBeGreaterThan(
    lightnessOf(computed('error-default')),
  )
})

test('in accent mode the state ink defaults to the accent’s ink', () => {
  const loud = Theme.standard(
    Theme.make({ accent: { hue: 265, chroma: 0.16 }, surface: { hover: 'accent' } }),
  )
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
    L.in('theme', Theme.root(loud, { omit: Theme.tokens, colorScheme: 'light' })),
  )
  document.head.append(style)
  const color = computed('state-ink')
  expect(distance(hueOf(color), 265), color).toBeLessThan(10)
  expect(chromaOf(color), color).toBeGreaterThan(chromaOf(computed('text-default')))
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, every code color reads on the base, and the hued kinds tell apart',
  scheme => {
    install(scheme)
    const base = lightnessOf(computed('surface-base'))
    const kinds = ['keyword', 'function', 'type', 'string', 'number', 'property']
    for (const kind of [...kinds, 'operator', 'punctuation', 'comment'])
      expect(Math.abs(lightnessOf(computed(`syntax-${kind}`)) - base), kind).toBeGreaterThan(0.3)
    const hues = kinds.map(kind => hueOf(computed(`syntax-${kind}`)))
    hues.forEach((hue, index) =>
      hues.slice(index + 1).forEach(other => expect(distance(hue, other)).toBeGreaterThan(15)),
    )
  },
)

test('the neutrals take a hue of their own, or the accent’s and follow it', () => {
  const sheet = (values: Values<Standard>, knobs = '') => {
    const style = document.createElement('style')
    style.dataset['test'] = ''
    style.textContent =
      Style.stylesheet(
        L.declare,
        L.in('theme', Theme.root(Theme.standard(Theme.make(values)), { colorScheme: 'light' })),
      ) + (knobs === '' ? '' : `:root{${knobs}}`)
    document.head.append(style)
  }
  const accent = { hue: 265, chroma: 0.16 }
  sheet({ accent, surface: { hue: 60, saturation: 0.02 } })
  expect(distance(hueOf(computed('surface-base')), 60)).toBeLessThan(10)
  expect(distance(hueOf(computed('accent-default')), 265)).toBeLessThan(10)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  // No neutral hue: the accent's, and a moved accent knob moves it.
  sheet({ accent, surface: { saturation: 0.02 } }, '--fk-knob-accent-h:150;')
  expect(distance(hueOf(computed('surface-base')), 150)).toBeLessThan(10)
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a shadow takes the hue it is given, and the neutrals’ without one',
  scheme => {
    const sheet = (values: Values<Standard>) => {
      const style = document.createElement('style')
      style.dataset['test'] = ''
      style.textContent = Style.stylesheet(
        L.declare,
        L.in('theme', Theme.root(Theme.standard(Theme.make(values)), { colorScheme: scheme })),
      )
      document.head.append(style)
    }
    const accent = { hue: 265, chroma: 0.16 }
    sheet({ accent, surface: { hue: 200 }, shadow: { hue: 40, chroma: 0.06 } })
    expect(distance(hueOf(computed('shadow-color')), 40)).toBeLessThan(5)
    expect(chromaOf(computed('shadow-color'))).toBeGreaterThan(0.05)
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    sheet({ accent, surface: { hue: 200, saturation: 0.03 } })
    expect(distance(hueOf(computed('shadow-color')), 200)).toBeLessThan(5)
  },
)

describe('a menu panel', () => {
  const install = (menu: NonNullable<Values<Standard>['menu']>) => {
    const style = document.createElement('style')
    style.dataset['test'] = ''
    style.textContent = Style.stylesheet(
      L.declare,
      L.in(
        'theme',
        Theme.root(Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 }, menu })), {
          colorScheme: 'light',
        }),
      ),
    )
    document.head.append(style)
  }
  const alphaOf = (color: string) => {
    const alpha = /\/\s*([\d.]+)\s*\)$/.exec(color)
    return alpha === null ? 1 : Number(alpha[1])
  }

  /** The same color, however the browser writes it (OKLab from a mix, OKLCH from a token). */
  const same = (a: string, b: string) =>
    Math.abs(lightnessOf(a) - lightnessOf(b)) < 0.005 &&
    Math.abs(chromaOf(a) - chromaOf(b)) < 0.005 &&
    (chromaOf(b) < 0.02 || distance(hueOf(a), hueOf(b)) < 2)

  test('is the page’s surface and text, its lit row a faint tint, by default', () => {
    install({})
    expect(same(computed('popup-surface'), computed('surface-base'))).toBe(true)
    expect(same(computed('popup-ink'), computed('text-default'))).toBe(true)
    expect(alphaOf(computed('popup-highlight'))).toBeLessThan(0.2)
  })

  test('lights its row in the accent when bold', () => {
    install({ highlight: 'bold' })
    expect(same(computed('popup-highlight'), computed('accent-default'))).toBe(true)
    expect(same(computed('popup-highlight-ink'), computed('accent-on-fill'))).toBe(true)
  })

  test('takes the other scheme’s surface and text when inverted', () => {
    install({ panel: 'inverted' })
    expect(lightnessOf(computed('popup-surface'))).toBeLessThan(0.4)
    expect(lightnessOf(computed('popup-ink'))).toBeGreaterThan(0.8)
  })

  test('shows the page through a blur when translucent', () => {
    install({ panel: 'translucent' })
    expect(alphaOf(computed('popup-surface'))).toBeCloseTo(0.8, 2)
    const swatch = document.createElement('div')
    swatch.style.backdropFilter = 'blur(var(--fk-popup-blur))'
    document.body.append(swatch)
    expect(getComputedStyle(swatch).backdropFilter).toBe('blur(12px)')
  })
})

test('the surface contrast knob spans steps a reader sees', () => {
  install('light')
  const at = (contrast: string) => {
    document.documentElement.style.setProperty('--fk-knob-surface-contrast', contrast)
    return lightnessOf(computed('surface-base')) - lightnessOf(computed('surface-muted'))
  }
  try {
    expect(at('0%')).toBeCloseTo(0, 3)
    // At its top a muted surface sits ten points below the base, where it sat four.
    expect(at('100%')).toBeGreaterThan(0.08)
  } finally {
    document.documentElement.style.removeProperty('--fk-knob-surface-contrast')
  }
})

/** OKLab of a computed OKLCH color, times 100, as the dataviz checks measure it. */
const labOf = (color: string): readonly [number, number, number] => {
  const lch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color)
  if (lch === null) throw new Error(`not an OKLCH color: ${color}`)
  const [l, c, h] = [Number(lch[1]), Number(lch[2]), (Number(lch[3]) * Math.PI) / 180]
  return [l * 100, c * Math.cos(h) * 100, c * Math.sin(h) * 100]
}

test.each([
  ['light', 0.43, 0.77],
  ['dark', 0.48, 0.67],
] as const)(
  'in a %s scheme, the chart colors sit in the band, keep their chroma, and neighbors tell apart',
  (scheme, low, high) => {
    install(scheme)
    const colors = ['1', '2', '3', '4', '5'].map(n => computed(`chart-${n}`))
    for (const color of colors) {
      expect(lightnessOf(color), color).toBeGreaterThanOrEqual(low)
      expect(lightnessOf(color), color).toBeLessThanOrEqual(high)
      expect(chromaOf(color), color).toBeGreaterThanOrEqual(0.1)
    }
    colors.slice(1).forEach((color, at) => {
      const [a, b] = [labOf(colors[at]!), labOf(color)]
      expect(
        Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
        `${at + 1} beside ${at + 2}`,
      ).toBeGreaterThanOrEqual(15)
    })
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a hard shadow is a solid offset copy, faded only by its strength',
  scheme => {
    const style = document.createElement('style')
    style.dataset['test'] = ''
    style.textContent = Style.stylesheet(
      L.declare,
      L.in(
        'tokens',
        Theme.root(Theme.standard(Theme.make({ shadow: { style: 'hard' } })), {
          colorScheme: scheme,
        }),
      ),
    )
    document.head.append(style)
    const raised = (strength: string) => {
      const box = document.createElement('div')
      box.style.boxShadow = 'var(--fk-shadow-md)'
      // On the root, where the token is declared and so resolved.
      document.documentElement.style.setProperty('--fk-knob-shadow-strength', strength)
      document.body.append(box)
      const shadow = getComputedStyle(box).boxShadow
      document.documentElement.style.removeProperty('--fk-knob-shadow-strength')
      return shadow
    }
    const full = raised('100%')
    // The color, then x, y, blur and spread: offset 3px, and no blur at all.
    expect(full).toMatch(/\) 3px 3px 0px 0px$/)
    expect(Number(/\/ ([\d.]+)\)/.exec(full)?.[1] ?? '1')).toBeGreaterThan(0.8)
    expect(raised('0%')).toMatch(/\/ 0\)|transparent|rgba\(0, 0, 0, 0\)/)
  },
)

test('the type knobs scale the text, spread the headings and open the lines', () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(L.declare, L.in('tokens', Theme.root(Theme.tokens)))
  document.head.append(style)
  /** A token as the browser computes it, in pixels, under `knobs` set on the root. */
  const measured = (token: string, knobs: Readonly<Record<string, string>>) => {
    const root = document.documentElement.style
    for (const [name, value] of Object.entries(knobs)) root.setProperty(`--fk-knob-${name}`, value)
    const box = document.createElement('div')
    box.style.fontSize = 'var(--fk-size-4xl)'
    box.style.lineHeight = token === 'leading' ? 'var(--fk-leading-normal)' : 'normal'
    box.style.inlineSize = token === 'size-md' ? 'var(--fk-size-md)' : 'auto'
    document.body.append(box)
    const computed = getComputedStyle(box)
    const value = Number.parseFloat(
      token === 'leading'
        ? computed.lineHeight
        : token === 'size-md'
          ? computed.width
          : computed.fontSize,
    )
    box.remove()
    for (const name of Object.keys(knobs)) root.removeProperty(`--fk-knob-${name}`)
    return value
  }
  // The shipped sizes, unchanged.
  expect(measured('size-4xl', {})).toBe(36)
  expect(measured('size-4xl', { 'text-scale': '1.25' })).toBe(45)
  // A heading at 0 stands no higher than the body; the body itself does not move.
  expect(measured('size-4xl', { 'heading-scale': '0' })).toBe(16)
  expect(measured('size-4xl', { 'heading-scale': '2' })).toBe(56)
  expect(measured('size-md', { 'heading-scale': '2' })).toBe(16)
  // 1.5 lines of 36px, then 1.8.
  expect(measured('leading', {})).toBe(54)
  expect(measured('leading', { leading: '1.2' })).toBeCloseTo(64.8, 1)
})
