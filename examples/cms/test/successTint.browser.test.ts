/**
 * The revision list's "Live" badge is a green tint of the page: the success
 * color mixed into the base. Mixed in OKLCH, the page's grey brought its own
 * hue into the mix (Chromium keeps the hue a grey was written with), and the
 * badge painted blue; any engine reading that hue as 0 would paint it red.
 */
import { afterEach, expect, test } from 'vitest'
import { stylesheet } from '../src/styles/sheet.js'
import { AdminStyle } from '../src/styles/adminStyle.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

/** A color's OKLCH chroma and hue as painted. */
const painted = (color: string) => {
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = color
  canvas.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = Array.from(canvas.getImageData(0, 0, 1, 1).data).map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { chroma: Math.hypot(a, bb), hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

const turn = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

test.each(['light', 'dark'] as const)('in a %s scheme, the Live badge is a green tint', scheme => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = `${stylesheet}${AdminStyle.globalCss}${AdminStyle.css}:root{color-scheme:${scheme}}`
  document.head.append(style)
  const badge = document.createElement('span')
  badge.append('Live')
  document.body.append(badge)
  const rules = (list: CSSRuleList): ReadonlyArray<CSSRule> =>
    Array.from(list).flatMap(rule => [
      rule,
      ...('cssRules' in rule ? rules((rule as CSSGroupingRule).cssRules) : []),
    ])
  const rule = rules(style.sheet!.cssRules).find(
    (rule): rule is CSSStyleRule =>
      rule instanceof CSSStyleRule && rule.style.cssText.includes('var(--fk-success-default) 14%'),
  )
  expect(rule, 'the badge’s rule').toBeDefined()
  badge.className = rule!.selectorText.replace(/^\./, '')
  const success = document.createElement('span')
  success.style.color = 'var(--fk-success-default)'
  document.body.append(success)
  const tint = painted(getComputedStyle(badge).backgroundColor)
  const green = painted(getComputedStyle(success).color)
  expect(tint.chroma).toBeGreaterThan(0.01)
  expect(turn(tint.hue, green.hue), `tint ${getComputedStyle(badge).backgroundColor}`).toBeLessThan(
    15,
  )
})
