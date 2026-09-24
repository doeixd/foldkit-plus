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
  it('scales space and radius by the density and radius knobs', () => {
    expect(Theme.tokens.knob).toEqual({ density: '1', 'radius-factor': '1' })
    expect(Theme.tokens.space.md).toBe('calc(1rem * var(--fk-knob-density))')
    expect(Theme.tokens.radius.md).toBe('calc(6px * var(--fk-knob-radius-factor))')
    expect(Theme.tokens.radius.full).toBe('9999px')
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
      'motion',
      'border',
      'breakpoint',
    ])
  })

  it('breakpoint is the record Style.responsive takes', () => {
    const piece = Style.responsive(Theme.tokens.breakpoint, { md: { display: 'flex' } })
    expect(piece.rules?.[0]?.at).toBe('@media (min-width: 48rem)')
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

  it('has the twelve groups', () => {
    expect(Object.keys(brand)).toEqual([
      'knob',
      'hue',
      'surface',
      'text',
      'outline',
      'accent',
      'secondary',
      'tertiary',
      'success',
      'warning',
      'error',
      'info',
    ])
  })

  it('records the knobs as literals, with defaults filled', () => {
    expect(brand.knob['accent-h']).toBe('280')
    expect(brand.knob['accent-l']).toBe('60%')
    expect(brand.knob['accent-l-dark']).toBe('70%')
    expect(brand.knob['accent-c-dark']).toBe('0.18')
    expect(brand.knob['surface-contrast']).toBe('65%')
    expect(brand.knob['success-h']).toBe('145')
  })

  it('writes computed knobs without float noise', () => {
    expect(brand.knob['surface-c-dark']).toBe('0.02')
    const loud = Theme.oklch({ accent: { h: 0, c: 0.27, l: '60%' }, surfaceSaturation: 0.02 })
    expect(loud.knob['accent-c-dark']).toBe('0.3')
    expect(loud.knob['surface-c-dark']).toBe('0.0267')
  })

  it('every value outside knob is a reference expression over tokens that exist', () => {
    for (const [group, names] of Object.entries(brand)) {
      if (group === 'knob') continue
      for (const [name, value] of Object.entries(names)) {
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
      'color-mix(in oklch, var(--fk-surface-base) calc(100% - var(--fk-knob-surface-contrast)), light-dark(oklch(from var(--fk-surface-base) calc(l - 0.055) calc(c * 1.2) h), oklch(from var(--fk-surface-base) calc(l + 0.045) calc(c * 1) h)) var(--fk-knob-surface-contrast))',
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

  it('gives every feedback family a contrast text pair', () => {
    for (const name of ['success', 'warning', 'error', 'info'] as const) {
      expect(brand[name].text).toBe(
        `oklch(from var(--fk-${name}-default) clamp(0.1, (0.65 / l - 1) * 999, 0.98) min(c, 0.08) h)`,
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
    expect(Theme.variable(brand, 'surface', 'overt')).toBe('var(--fk-surface-overt)')
    // @ts-expect-error not a surface token
    Theme.variable(brand, 'surface', 'loud')
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
        outline: `2px solid ${Theme.variable(theme, 'outline', 'focus')}`,
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
      page,
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
      /\.style-[a-z0-9]+:focus-within\{outline:2px solid var\(--fk-outline-focus\)\}$/,
    )
  })
})
