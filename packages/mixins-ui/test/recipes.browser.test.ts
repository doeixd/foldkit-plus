/**
 * The recipes over a real palette, in a real browser that does the color math:
 * a neutral control that is on stands out from the page, an outlined neutral
 * button's line can be seen, and a chosen pill tab is the accent's tint.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, CheckboxSlots, Recipes, SwitchSlots, TabsSlots } from '../src/index.js'

const theme = Theme.compose(
  Theme.tokens,
  Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' }, surfaceSaturation: 0.012 }),
)
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const sheets: Array<string> = []

/** One slot's classes, its CSS kept for `install`. */
const classOf = (
  slots: Readonly<Record<string, unknown>>,
  pieces: Readonly<Record<string, StyleValue>>,
  key: string,
): string => {
  const piece = pieces[key]
  if (piece === undefined) throw new Error(`no ${key} piece`)
  const one = Style.forSlots(slots as never)({ [key]: piece } as never) as {
    readonly css: string
    readonly rules: ReadonlyArray<{ readonly className: string }>
  }
  sheets.push(one.css)
  return [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
}

const install = (scheme: 'light' | 'dark') => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    sheets.join('')
  document.head.append(style)
  document.body.style.background = 'var(--fk-surface-base)'
}

const element = (html: string): HTMLElement => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  const first = holder.firstElementChild
  if (!(first instanceof HTMLElement)) throw new Error('no element')
  document.body.append(holder)
  return first
}

/** OKLCH's or OKLab's lightness of a computed color; the palette computes to one or the other. */
const lightnessOf = (color: string) => {
  const match = /^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)
  if (match === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return Number(match[1])
}
const pageLightness = () => lightnessOf(getComputedStyle(document.body).backgroundColor)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a neutral switch or checkbox that is on stands out from the page',
  scheme => {
    const toggle = classOf(SwitchSlots, Recipes.Switch({ tone: 'neutral' }), 'button')
    const box = classOf(CheckboxSlots, Recipes.Checkbox({ tone: 'neutral' }), 'checkbox')
    install(scheme)
    const page = pageLightness()
    for (const html of [
      `<button role="switch" aria-checked="true" class="${toggle}"></button>`,
      `<button role="checkbox" aria-checked="true" class="${box}"></button>`,
    ]) {
      const on = lightnessOf(getComputedStyle(element(html)).backgroundColor)
      expect(Math.abs(on - page), html).toBeGreaterThan(0.4)
    }
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, an outlined neutral button’s line can be seen',
  scheme => {
    const button = classOf(
      ButtonSlots,
      Recipes.Button({ tone: 'neutral', variant: 'outline' }),
      'button',
    )
    install(scheme)
    const line = lightnessOf(
      getComputedStyle(element(`<button class="${button}">b</button>`)).borderTopColor,
    )
    expect(Math.abs(line - pageLightness())).toBeGreaterThan(0.1)
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the chosen pill tab is the accent’s tint and ink',
  scheme => {
    const tab = classOf(TabsSlots, Recipes.Tabs({ variant: 'pill' }), 'tab')
    install(scheme)
    const chosen = getComputedStyle(
      element(`<button role="tab" aria-selected="true" class="${tab}">t</button>`),
    )
    const swatch = element(
      '<span style="background:var(--fk-accent-subtle);color:var(--fk-accent-ink)"></span>',
    )
    expect(chosen.backgroundColor).toBe(getComputedStyle(swatch).backgroundColor)
    expect(chosen.color).toBe(getComputedStyle(swatch).color)
  },
)
