/**
 * The `/theme` subpath: `root` and `scoped` as page pieces, the shipped
 * `tokens` and their breakpoint widths, and the `oklch` palette, whose
 * every non-knob value is a CSS reference that resolves inside the theme.
 */
import { describe, expect, it } from 'vitest'
import { Diagnostics, Layers, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const cssOf = (piece: { readonly globalCss?: ReadonlyArray<string> }) =>
  (piece.globalCss ?? []).join('')

describe('Theme.root', () => {
  const brand = Theme.define({ color: { ink: '#111' }, space: { md: '1rem' } })

  it('declares every token on :root with the color scheme last', () => {
    expect(cssOf(Theme.root(brand))).toBe(
      ':root{--fk-color-ink:#111;--fk-space-md:1rem;color-scheme:light dark}',
    )
  })

  it('omits the tokens another theme carries, name by name', () => {
    const shared = Theme.define({ space: { md: '2rem' } })
    expect(cssOf(Theme.root(brand, { omit: shared }))).toBe(
      ':root{--fk-color-ink:#111;color-scheme:light dark}',
    )
    const wider = Theme.define({ color: { ink: '#111' }, space: { md: '1rem', lg: '2rem' } })
    expect(cssOf(Theme.root(wider, { omit: shared }))).toBe(
      ':root{--fk-color-ink:#111;--fk-space-lg:2rem;color-scheme:light dark}',
    )
  })

  it('takes a fixed color scheme', () => {
    expect(cssOf(Theme.root({}, { colorScheme: 'dark' }))).toBe(':root{color-scheme:dark}')
  })

  it('is a bare piece: no classes, no inline style, no rules', () => {
    const piece = Theme.root(brand)
    expect(piece.classes).toEqual([])
    expect(piece.style).toEqual({})
    expect(piece.rules).toBeUndefined()
  })
})

describe('Theme.scoped', () => {
  it('writes the overrides under the selector, unlayered', () => {
    const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })
    expect(
      cssOf(Theme.scoped(palette, ':root[data-theme="ocean"]', { knob: { 'accent-h': '215' } })),
    ).toBe(':root[data-theme="ocean"]{--fk-knob-accent-h:215}')
  })
})

describe('Theme.tokens', () => {
  it('scales space, radius, and durations by their knobs', () => {
    expect(Theme.tokens.knob).toMatchObject({
      density: '1',
      'radius-factor': '1',
      motion: '1',
      travel: '1',
      step: '0',
      'shadow-strength': '100%',
      'text-scale': '1',
      'heading-scale': '1',
      leading: '1',
      'control-round': '0',
      // The standard knobs' defaults the tokens below read.
      'border-width': '1px',
      'font-body': 'system-ui, sans-serif',
      'font-heading': 'inherit',
      'heading-weight': '600',
      'heading-tracking': '-0.01em',
      ease: 'ease-out',
    })
    expect(Theme.tokens.border.thick).toBe('calc(var(--fk-knob-border-width) + 1px)')
    expect(Theme.tokens.font.body).toBe('var(--fk-knob-font-body)')
    expect(Theme.tokens.space.md).toBe('calc(1rem * var(--fk-knob-density))')
    expect(Theme.tokens.radius.md).toBe('calc(6px * var(--fk-knob-radius-factor))')
    expect(Theme.tokens.radius.full).toBe('calc(9999px * min(var(--fk-knob-radius-factor), 1))')
    expect(Theme.tokens.motion.fast).toBe('calc(80ms * var(--fk-knob-motion))')
    expect(Theme.tokens.motion.moderate).toBe('calc(160ms * var(--fk-knob-motion))')
    expect(Theme.tokens.motion.slow).toBe('calc(240ms * var(--fk-knob-motion))')
    // Each exit a tier quicker than its entrance.
    expect(Theme.tokens.motion['moderate-exit']).toBe('calc(120ms * var(--fk-knob-motion))')
    expect(Theme.tokens.motion.ease).toBe('var(--fk-knob-ease)')
  })

  it('a still theme zeroes every recipe transition through the knob', () => {
    const still = Theme.compose(Theme.tokens, { knob: { motion: '0' } })
    expect(still.knob.motion).toBe('0')
    expect(still.motion.fast).toBe('calc(80ms * var(--fk-knob-motion))')
  })

  it('names the groups a design system shares', () => {
    expect(Object.keys(Theme.tokens)).toEqual([
      'knob',
      'space',
      'radius',
      'font',
      'size',
      'leading',
      'weight',
      'tracking',
      'motion',
      'control',
      'type',
      'width',
      'border',
      'shadow',
      'breakpoint',
      'safe',
    ])
  })

  it('draws every shadow in the one color a palette sets, dimmed by the strength knob', () => {
    const { raised, pressed, field, ...elevation } = Theme.tokens.shadow
    expect(Object.keys(elevation)).toHaveLength(7)
    // Each token is what the shadow knobs chose: soft and flat by default.
    const knob = Theme.tokens.knob
    expect([raised, pressed, field]).toEqual([
      'var(--fk-knob-relief-raised)',
      'var(--fk-knob-relief-pressed)',
      'var(--fk-knob-relief-field)',
    ])
    expect([knob['relief-raised'], knob['relief-pressed'], knob['relief-field']]).toEqual([
      '0 0 #0000',
      '0 0 #0000',
      '0 0 #0000',
    ])
    for (const [step, token] of Object.entries(elevation))
      expect(token).toBe(`var(--fk-knob-shadow-${step})`)
    for (const list of [
      knob['shadow-xs'],
      knob['shadow-md'],
      knob['shadow-2xl'],
      knob['shadow-inset'],
    ]) {
      expect(list).toContain('var(--fk-shadow-color, oklch(0% 0 0 / 0.12))')
      expect(list).toContain('var(--fk-knob-shadow-strength, 100%)')
    }
    // Each layer of a step is drawn in it, not only the first.
    expect(knob['shadow-md'].split('var(--fk-shadow-color').length - 1).toBe(2)
  })

  it('keeps a deeper step for modals', () => {
    expect(Theme.tokens.knob['shadow-2xl']).toContain('32px')
  })

  it('breakpoint is the record Style.responsive takes', () => {
    const piece = Style.responsive(Theme.tokens.breakpoint, { md: { display: 'flex' } })
    expect(piece.rules?.[0]?.at).toBe('@media (min-width: 48rem)')
  })

  it('measures the same breakpoints on a named container', () => {
    const page = Theme.inContainer('page', Theme.tokens.breakpoint)
    expect(page.md).toBe('@container page (min-width: 48rem)')
    const piece = Style.responsive(page, { md: { display: 'flex' } })
    expect(piece.rules?.[0]?.at).toBe('@container page (min-width: 48rem)')
    expect(Theme.breakpointWidths({ breakpoint: page })).toEqual({
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    })
  })
})

describe('Theme.breakpointWidths', () => {
  it('gives each breakpoint as pixels, rem at 16', () => {
    expect(Theme.breakpointWidths(Theme.tokens)).toEqual({ sm: 640, md: 768, lg: 1024, xl: 1280 })
    expect(Theme.breakpointWidths({ breakpoint: { wide: '(min-width: 900px)' } })).toEqual({
      wide: 900,
    })
  })

  it('refuses a query with no single min-width', () => {
    expect(() =>
      Theme.breakpointWidths({ breakpoint: { print: '(orientation: landscape)' } }),
    ).toThrow(Diagnostics.DiagnosticError)
    const thrown = (() => {
      try {
        Theme.breakpointWidths({ breakpoint: { print: 'print' } })
        return undefined
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(Diagnostics.DiagnosticError)
    if (thrown instanceof Diagnostics.DiagnosticError) {
      expect(thrown.diagnostic.code).toBe('theme:unparseable-breakpoint')
      expect(thrown.diagnostic.details).toEqual({ name: 'print', query: 'print' })
    }
  })
})

describe('Theme.oklch', () => {
  const brand = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })

  const references = (value: string): ReadonlyArray<readonly [string, string]> =>
    [...value.matchAll(/var\(--fk-([a-z]+)-([a-z0-9-]+)\)/g)].map(match => [
      match[1] ?? '',
      match[2] ?? '',
    ])

  it('has the twenty-four groups', () => {
    expect(Object.keys(brand)).toEqual([
      'knob',
      'hue',
      'surface',
      'text',
      'outline',
      'accent',
      'secondary',
      'tertiary',
      'shadow',
      'state',
      'popup',
      'success',
      'warning',
      'error',
      'info',
      'chart',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'blue',
      'purple',
      'syntax',
    ])
  })

  it('steps every color scale down one lightness ladder, and washes step 6 into the page', () => {
    const names = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'] as const
    const lightness = (value: string) => Number(value.match(/^oklch\(([\d.]+)%/)?.[1])
    const ladder = (name: (typeof names)[number]) =>
      (['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const).map(step =>
        lightness(brand[name][step]),
      )
    const first = ladder('red')
    // Near white to near black, each step darker than the last.
    expect(first[0]).toBeGreaterThan(95)
    expect(first.at(-1)).toBeLessThan(25)
    first.slice(1).forEach((value, index) => expect(value).toBeLessThan(first[index]!))
    // The same ladder in every hue, each on its own hue knob.
    for (const name of names) {
      expect(ladder(name)).toEqual(first)
      expect(brand[name]['6']).toContain(`var(--fk-knob-${name}-h)`)
      expect(brand[name]['wash-1']).toBe(
        `color-mix(in oklab, var(--fk-${name}-6) 8%, var(--fk-surface-base))`,
      )
    }
  })

  it('sets the shadow color per scheme, denser on a dark surface', () => {
    const color = brand.shadow.color
    const [light, dark] = color.slice('light-dark('.length, -1).split(/,\s*(?=oklch)/)
    const alpha = (value = '') => Number(value.match(/\/\s*([\d.]+)\)\s*$/)?.[1])
    expect(color.startsWith('light-dark(')).toBe(true)
    expect(alpha(dark)).toBeGreaterThan(alpha(light))
  })

  it('names the state ink the text, or the accent’s ink', () => {
    // The state ink is the knob the hover choice writes.
    expect(brand.state.ink).toBe('var(--fk-knob-state-ink)')
    expect(brand.knob['state-ink']).toBe('currentColor')
    const knobs = { accent: { h: 280, c: 0.15, l: '60%' } } as const
    expect(Theme.oklch({ ...knobs, stateHue: 'neutral' }).knob['state-ink']).toBe('currentColor')
    expect(Theme.oklch({ ...knobs, stateHue: 'accent' }).knob['state-ink']).toBe(
      'var(--fk-accent-ink)',
    )
  })

  it('lets painted surfaces name their ink except in neutral', () => {
    expect(brand.knob['surface-ink']).toBe('1')
    const knobs = { accent: { h: 280, c: 0.15, l: '60%' } } as const
    expect(Theme.oklch({ ...knobs, stateHue: 'neutral' }).knob['surface-ink']).toBe('0')
    expect(Theme.oklch({ ...knobs, stateHue: 'accent' }).knob['surface-ink']).toBe('1')
  })

  it('names a separate field ground on the default step', () => {
    expect(brand.surface.field).toBe('var(--fk-surface-default)')
  })

  it('records the knobs as literals, with defaults filled', () => {
    expect(brand.knob['accent-h']).toBe('280')
    expect(brand.knob['accent-l']).toBe('60%')
    expect(brand.knob['accent-l-dark']).toBe('70%')
    expect(brand.knob['accent-c-dark']).toBe('0.18')
    expect(brand.knob['surface-contrast']).toBe('26%')
    expect(brand.knob['success-h']).toBe('145')
  })

  it('writes computed knobs without float noise', () => {
    expect(brand.knob['surface-c-dark']).toBe('0.02')
    const loud = Theme.oklch({ accent: { h: 0, c: 0.27, l: '60%' }, surfaceSaturation: 0.02 })
    expect(loud.knob['accent-c-dark']).toBe('0.3')
    expect(loud.knob['surface-c-dark']).toBe('0.0267')
  })

  it('every value outside knob is a reference expression over tokens that exist', () => {
    // `currentColor` resolves on the element reading the token, so it is the
    // one live literal a value may be.
    for (const [group, names] of Object.entries(brand)) {
      if (group === 'knob') continue
      for (const [name, value] of Object.entries(names)) {
        if (value === 'currentColor') continue
        const found = references(value)
        expect(found.length, `${group}.${name} references nothing`).toBeGreaterThan(0)
        for (const [refGroup, refName] of found) {
          expect(brand, `${group}.${name} -> ${refGroup}.${refName}`).toHaveProperty([
            refGroup,
            refName,
          ])
        }
      }
    }
  })

  it('no value references itself', () => {
    for (const [group, names] of Object.entries(brand)) {
      for (const [name, value] of Object.entries(names)) {
        expect(references(value)).not.toContainEqual([group, name])
      }
    }
  })

  it('is deterministic', () => {
    expect(Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })).toEqual(brand)
    expect(cssOf(Theme.root(brand))).toBe(cssOf(Theme.root(brand)))
  })

  it('derives surfaces by mixing the base toward a target by surface-contrast', () => {
    expect(brand.surface.default).toBe(
      'color-mix(in oklch, var(--fk-surface-base) calc(100% - var(--fk-knob-surface-contrast)), light-dark(oklch(from var(--fk-surface-base) calc(l - 0.1375) calc(c * 1.625) h), oklch(from var(--fk-surface-base) calc(l + 0.1125) calc(c * 1.25) h)) var(--fk-knob-surface-contrast))',
    )
  })

  it('scales text chroma by surface saturation and the contrast factor', () => {
    expect(brand.text.default).toBe(
      'light-dark(oklch(20% calc(var(--fk-knob-surface-c) * 2 * var(--fk-knob-contrast-factor)) var(--fk-hue-neutral)), oklch(88% calc(var(--fk-knob-surface-c-dark) * 0.8 * var(--fk-knob-contrast-factor)) var(--fk-hue-neutral)))',
    )
  })

  it('derives links from the accent with relative color syntax', () => {
    expect(brand.text.link).toBe(
      'oklch(from var(--fk-accent-default) calc(l + 0.1) calc(c + 0.05) h)',
    )
    expect(brand.text['link-hover']).toBe(
      'oklch(from var(--fk-text-link) calc(l - 0.1) calc(c + 0) h)',
    )
  })

  it('gives every family text on its fill and ink on the base surface', () => {
    const families = [
      'accent',
      'secondary',
      'tertiary',
      'success',
      'warning',
      'error',
      'info',
    ] as const
    for (const name of families) {
      expect(brand[name]['on-fill']).toBe(
        `oklch(from var(--fk-${name}-default) clamp(0.1, (0.65 / l - 1) * 999, 0.98) min(c, 0.08) h)`,
      )
      expect(brand[name].ink).toBe(
        `light-dark(oklch(from var(--fk-${name}-default) 0.5 c h), oklch(from var(--fk-${name}-default) 0.8 c h))`,
      )
    }
  })

  it('overriding a knob through compose changes only that line of the root', () => {
    const ocean = Theme.compose(brand, { knob: { 'accent-h': '215' } })
    const before = cssOf(Theme.root(brand)).split(';')
    const after = cssOf(Theme.root(ocean)).split(';')
    expect(after.length).toBe(before.length)
    const changed = before.filter((line, index) => line !== after[index])
    expect(changed).toEqual([':root{--fk-knob-accent-h:280'])
  })

  it('is a concrete type: a known token autocompletes, an unknown one is refused', () => {
    expect(Theme.ref(brand).surface.overt).toBe('var(--fk-surface-overt)')
    // @ts-expect-error not a surface token
    Theme.ref(brand).surface.loud
  })
})

describe('the page sheet', () => {
  it('composes layers, tokens, a theme, a scoped override, and a page style', () => {
    const L = Layers.standard
    const theme = Theme.compose(
      Theme.tokens,
      Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }),
    )
    const page = Style.compose(
      Style.class('page'),
      Style.pseudo(':focus-within', {
        outline: `2px solid ${Theme.ref(theme).outline.focus}`,
      }),
    )
    const sheet = Style.stylesheet(
      L.declare,
      L.in('tokens', Theme.root(Theme.tokens)),
      L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
      L.in(
        'theme',
        Theme.scoped(theme, ':root[data-theme="ocean"]', { knob: { 'accent-h': '215' } }),
      ),
      L.in('app', page),
    )
    expect(
      sheet.startsWith(
        '@layer reset, tokens, theme, defaults, components, layouts, variants, utilities, app;',
      ),
    ).toBe(true)
    expect(sheet).toContain('@layer tokens{:root{--fk-knob-density:1;')
    // Both themes carry a `knob` group; only the scales' knobs are omitted.
    expect(sheet).toContain('@layer theme{:root{--fk-knob-accent-h:280;')
    expect(sheet).not.toContain('--fk-knob-density:1;--fk-knob-radius-factor:1;--fk-knob-accent-h')
    expect(sheet).toContain('@layer theme{:root[data-theme="ocean"]{--fk-knob-accent-h:215}}')
    expect(sheet).toMatch(
      /@layer app\{\.style-[a-z0-9]+:focus-within\{outline:2px solid var\(--fk-outline-focus\)\}\}$/,
    )
  })
})
