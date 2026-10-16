/**
 * The Button recipe's press and toggle states, read from its CSS: a held
 * button deepens to its family's `active` fill, and a toggle that is on
 * (`aria-pressed="true"`) is filled in every variant. The press on a real
 * page is `press.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { ButtonSlots, Recipes } from '../src/index.js'

const css = (selection: Parameters<typeof Recipes.Button>[0]): string =>
  Style.forSlots(ButtonSlots)(Recipes.Button(selection)).css

/** The declarations of every rule whose selector ends in `suffix`, joined. */
const ruleOf = (sheet: string, suffix: string): string => {
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...sheet.matchAll(new RegExp(`${escaped}\\{([^}]*)\\}`, 'g'))]
    .map(match => match[1])
    .join(';')
}

const held = ':active:not([aria-disabled="true"], :disabled)'

describe('Button press', () => {
  it.each([
    ['accent', 'var(--fk-accent-active)'],
    ['danger', 'var(--fk-error-active)'],
  ] as const)('gives the %s tone its family’s active fill', (tone, active) => {
    expect(css({ tone })).toContain(`--_fk-tone-fill-active:${active}`)
  })

  it('deepens a held solid button to the active fill', () => {
    expect(ruleOf(css({ variant: 'solid' }), held)).toContain(
      'background:var(--_fk-tone-fill-active)',
    )
  })

  it.each(['outline', 'ghost', 'icon'] as const)(
    'grounds a held %s button deeper than its hover',
    variant => {
      expect(ruleOf(css({ variant, size: null }), held)).toContain(
        'background:color-mix(in oklab, var(--_fk-tone-ink) 16%, transparent)',
      )
    },
  )

  it('gives a little while held, by the travel knob', () => {
    expect(css({})).toMatch(
      /@layer components\{[^@]*:active:not\(\[aria-disabled="true"\], :disabled\)\{scale:calc\(1 - 0\.02 \* var\(--fk-knob-travel\)\)\}/,
    )
  })
})

describe('Button pressed', () => {
  it('fills a solid toggle that is on with its active fill', () => {
    expect(ruleOf(css({ variant: 'solid' }), '[aria-pressed="true"]')).toContain(
      'background:var(--_fk-tone-fill-active)',
    )
  })

  it.each(['outline', 'ghost', 'icon'] as const)(
    'fills a %s toggle that is on with its tone, and keeps it hovered',
    variant => {
      const sheet = css({ variant, size: null })
      const on = ruleOf(sheet, '[aria-pressed="true"]')
      expect(on).toContain('background:var(--_fk-tone-fill)')
      expect(on).toContain('color:var(--_fk-tone-on-fill)')
      expect(
        ruleOf(sheet, '[aria-pressed="true"]:hover:not([aria-disabled="true"], :disabled)'),
      ).toContain('background:var(--_fk-tone-fill-hover)')
    },
  )
})

describe('Button state ink', () => {
  it.each([
    ['accent', 'var(--fk-accent-default)'],
    ['danger', 'var(--fk-error-default)'],
  ] as const)('names the %s tone’s fill as the state ink where the theme lets it', (tone, fill) => {
    expect(css({ tone })).toContain(
      `--fk-state-ink:color-mix(in oklab, ${fill} calc(var(--fk-knob-surface-ink) * 100%), currentColor)`,
    )
  })

  it('keeps the neutral tone’s state ink the text', () => {
    expect(css({ tone: 'neutral' })).toContain('--fk-state-ink:currentColor')
  })
})
