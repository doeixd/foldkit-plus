/**
 * Selected text, in a real browser: a selection is made in the page and its
 * `::selection` style read back. The default is the accent's tint, a theme can
 * set the tokens, the accent knob moves it, and the text on it reads at AA.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Defaults } from '../src/defaults.js'
import { Theme } from '../src/theme.js'

const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  getSelection()?.removeAllRanges()
})

const install = (theme: ReturnType<typeof Theme.standard>, colorScheme: 'light' | 'dark') => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('defaults', Defaults.all),
    L.in('theme', Theme.root(theme, { colorScheme })),
  )
  document.head.append(style)
}

/** A paragraph with its text selected, as a user's drag leaves it. */
const selectedParagraph = (): HTMLElement => {
  const paragraph = document.createElement('p')
  paragraph.textContent = 'Selected words in a paragraph'
  document.body.append(paragraph)
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return paragraph
}

const selectionOf = (element: Element) => getComputedStyle(element, '::selection')

type Rgba = readonly [number, number, number, number]

/** Any CSS color as sRGB 8-bit channels, as a canvas paints it. */
const paint = (color: string, over: Rgba = [0, 0, 0, 0]): Rgba => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('no canvas')
  context.fillStyle = `rgba(${over[0]}, ${over[1]}, ${over[2]}, ${over[3] / 255})`
  context.fillRect(0, 0, 1, 1)
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b, a]
}

const luminance = ([r, g, b]: Rgba): number => {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (a: Rgba, b: Rgba): number => {
  const [light, dark] = [Math.max(luminance(a), luminance(b)), Math.min(luminance(a), luminance(b))]
  return (light + 0.05) / (dark + 0.05)
}

describe('the default selection', () => {
  test('is not the user agent’s: a page with no theme gets the accent fallback, a theme its tint', () => {
    const bare = document.createElement('style')
    bare.dataset['test'] = ''
    bare.textContent = Style.stylesheet(L.declare, L.in('defaults', Defaults.body))
    document.head.append(bare)
    const unthemed = selectionOf(selectedParagraph()).backgroundColor
    expect(paint(unthemed)[3]).toBeGreaterThan(0)
    bare.remove()
    document.body.replaceChildren()

    install(Theme.standard(Theme.make({})), 'light')
    const themed = selectionOf(selectedParagraph()).backgroundColor
    const [, , , alpha] = paint(themed)
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(255)
  })

  test.each(['light', 'dark'] as const)('keeps the text readable at AA in a %s scheme', scheme => {
    install(Theme.standard(Theme.make({})), scheme)
    const paragraph = selectedParagraph()
    const page = paint(getComputedStyle(document.body).backgroundColor)
    const ground = paint(selectionOf(paragraph).backgroundColor, page)
    const ink = paint(getComputedStyle(paragraph).color)
    // A selection that vanished into the page would pass on contrast alone.
    expect(contrast(ground, page)).toBeGreaterThan(1.1)
    expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('selection on the accent’s own fill', () => {
  test.each(['light', 'dark'] as const)(
    'a surface that sets fill-background stands off its fill and keeps its text at AA in a %s scheme',
    scheme => {
      install(Theme.standard(Theme.make({})), scheme)
      const band = document.createElement('p')
      band.textContent = 'Words on the accent'
      band.style.cssText =
        'background:var(--fk-accent-default);color:var(--fk-accent-on-fill);--fk-selection-background:var(--fk-selection-fill-background)'
      document.body.append(band)
      const range = document.createRange()
      range.selectNodeContents(band)
      getSelection()?.addRange(range)
      const style = getComputedStyle(band)
      const fill = paint(style.backgroundColor)
      const ground = paint(selectionOf(band).backgroundColor, fill)
      expect(contrast(ground, fill)).toBeGreaterThan(1.3)
      expect(contrast(paint(style.color), ground)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe('a theme’s selection', () => {
  test('is the token it sets', () => {
    install(Theme.standard(Theme.make({})), 'light')
    const before = selectionOf(selectedParagraph()).backgroundColor
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    document.body.replaceChildren()

    const palette = Theme.standard(Theme.make({}))
    install(
      Theme.compose(palette, {
        selection: { background: 'rgb(10, 200, 30)', ink: 'rgb(255, 0, 0)' },
      }),
      'light',
    )
    const set = selectionOf(selectedParagraph())
    expect(set.backgroundColor).not.toBe(before)
    expect(paint(set.backgroundColor)).toEqual([10, 200, 30, 255])
    expect(paint(set.color)).toEqual([255, 0, 0, 255])
  })

  test('follows the accent knob', () => {
    // The surfaces keep their own hue, so a grey that merely took the page's tint would not pass.
    const surface = { hue: 145 }
    install(Theme.standard(Theme.make({ accent: { hue: 25 }, surface })), 'light')
    const warm = paint(selectionOf(selectedParagraph()).backgroundColor)
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    document.body.replaceChildren()

    install(Theme.standard(Theme.make({ accent: { hue: 265 }, surface })), 'light')
    const cool = paint(selectionOf(selectedParagraph()).backgroundColor)
    // Red against blue: the red channel leads far in one and trails far in the other.
    expect(warm[0] - warm[2]).toBeGreaterThan(40)
    expect(cool[2] - cool[0]).toBeGreaterThan(40)
  })

  test('an application’s own ::selection rule wins over the default', () => {
    install(Theme.standard(Theme.make({})), 'light')
    const own = document.createElement('style')
    own.dataset['test'] = ''
    own.textContent = '::selection{background:rgb(1, 2, 3)}'
    document.head.append(own)
    expect(paint(selectionOf(selectedParagraph()).backgroundColor)).toEqual([1, 2, 3, 255])
  })
})
