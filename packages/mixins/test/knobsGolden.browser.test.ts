/**
 * A theme of typed knobs declares what the palette and knob strings it
 * replaces declared: for each pair, every knob variable resolves to the same
 * value in a real browser. Where the two spell a value differently (a dark
 * chroma `Theme.oklch` worked out in JavaScript, one the knobs follow in
 * CSS), both are computed by the browser before they are compared.
 */
import { expect, test } from 'vitest'
import { Theme, type Values, type Standard } from '../src/theme.js'

interface Pair {
  readonly name: string
  readonly old: ReturnType<typeof Theme.define>
  readonly values: Values<Standard>
}

const over = (palette: ReturnType<typeof Theme.oklch>, knob: Record<string, string> = {}) =>
  Theme.compose(Theme.compose(Theme.tokens, palette), Theme.define({ knob }))

const pairs: ReadonlyArray<Pair> = [
  {
    name: 'the defaults',
    old: over(Theme.oklch({ accent: { h: 264, c: 0.17, l: '52%' } })),
    values: {},
  },
  {
    name: 'Cobalt',
    old: over(
      Theme.oklch({
        accent: { h: 235, c: 0.225, l: '55%' },
        surfaceSaturation: 0,
        neutral: { h: 0 },
        surfaceContrast: '24%',
        menu: { accent: 'subtle', color: 'inverted' },
      }),
      {
        'radius-factor': '1.8',
        density: '1.1',
        motion: '0.5',
        'shadow-strength': '0%',
        'base-l': '97%',
        'base-l-dark': '24.5%',
        'text-scale': '1.025',
        'heading-scale': '1.2',
        leading: '1.05',
        'scale-c': '1.1',
      },
    ),
    values: {
      accent: { hue: 235, chroma: 0.225, lightness: 55 },
      surface: { saturation: 0, hue: 0, contrast: 24, lightness: { light: 97, dark: 24.5 } },
      menu: { highlight: 'subtle', panel: 'inverted' },
      shape: { radius: 1.8, density: 1.1 },
      motion: { scale: 0.5 },
      shadow: { strength: 0 },
      type: { scale: 1.025, headingScale: 1.2, leading: 1.05 },
      scales: { chroma: 1.1 },
    },
  },
  {
    name: 'every palette option set',
    old: over(
      Theme.oklch({
        accent: { h: 30, c: 0.1, l: '40%', dark: { l: '75%', c: 0.12 } },
        secondaryHueShift: 30,
        tertiaryHueShift: -45,
        shadow: { h: 200, c: 0.05 },
        surfaceSaturation: 0.02,
        contrastFactor: 1.2,
        syntaxChroma: 0.2,
        feedback: { success: 150, warning: 70, error: 20, info: 240 },
        menu: { accent: 'bold', color: 'translucent' },
      }),
      { step: '1', 'control-round': '1' },
    ),
    values: {
      accent: {
        hue: 30,
        chroma: { light: 0.1, dark: 0.12 },
        lightness: { light: 40, dark: 75 },
        secondaryShift: 30,
        tertiaryShift: -45,
      },
      shadow: { hue: 200, chroma: 0.05 },
      surface: { saturation: 0.02, textContrast: 1.2 },
      code: { chroma: 0.2 },
      feedback: { success: 150, warning: 70, error: 20, info: 240 },
      menu: { highlight: 'bold', panel: 'translucent' },
      shape: { size: 'compact', controls: 'pill' },
    },
  },
  {
    name: 'a saturation the dark scheme and the shadow follow',
    old: over(Theme.oklch({ accent: { h: 120, c: 0.05, l: '60%' }, surfaceSaturation: 0.03 })),
    values: { accent: { hue: 120, chroma: 0.05, lightness: 60 }, surface: { saturation: 0.03 } },
  },
]

/** `value` as the browser computes it, on an element declaring `tokens`. */
const computed = (tokens: ReturnType<typeof Theme.define>, value: string) => {
  const probe = document.createElement('div')
  for (const [group, names] of Object.entries(tokens))
    for (const [name, token] of Object.entries(names))
      probe.style.setProperty(`--fk-${group}-${name}`, token)
  // A number the knobs are all unitless or a percentage of: flex-grow reads either.
  probe.style.flexGrow = `calc(${value.endsWith('%') ? value.slice(0, -1) : value})`
  document.body.append(probe)
  const read = getComputedStyle(probe).flexGrow
  probe.remove()
  return Number(read)
}

test.each(pairs)('$name: every knob resolves as before', ({ old, values }) => {
  const knobs = Theme.variables(Theme.make(values))
  const fresh = Theme.compose(old, Theme.define({ knob: knobs }))
  for (const [name, value] of Object.entries(knobs)) {
    const before = old['knob']?.[name]
    expect(before, name).toBeDefined()
    if (before === value) continue
    // To the four decimals `Theme.oklch` rounded what it worked out to.
    expect(computed(fresh, value), name).toBeCloseTo(computed(old, before!), 4)
  }
})
