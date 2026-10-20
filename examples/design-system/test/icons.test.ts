/**
 * The chips' icons: each `data-icon` value shows the mask `pnpm icons` wrote for
 * it, from `icons.json`, not a drawing written into the style by hand.
 */
import { expect, it } from 'vitest'
import { masks } from '../src/iconMasks.js'
import { IconStyle } from '../src/style.js'

it.each(Object.entries(masks))('a %s chip shows its generated mask', (name, mask) => {
  const css = IconStyle.style.css
  const at = css.indexOf(`[data-icon="${name}"]{`)
  expect(at).toBeGreaterThan(-1)
  expect(css.slice(at, css.indexOf('}', at))).toContain(mask)
})
