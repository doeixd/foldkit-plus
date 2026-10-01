/**
 * The studio's tabs and toolbar buttons: a finger's 44px floor where the
 * pointer is coarse, both ways round. The controls of a region get height
 * only (`Touch.targets`), which leaves a short one as narrow as its words.
 */
import { Style } from 'foldkit-mixins'
import { expect, it } from 'vitest'

import { AdminSlots, AdminStyle } from '../src/styles/adminStyle.js'

const tab = Style.forSlots(AdminSlots)({
  tab: AdminStyle.pieces.tab ?? Style.empty,
}).css
const button = Style.forSlots(AdminSlots)({
  button: AdminStyle.pieces.button ?? Style.empty,
}).css
const danger = Style.forSlots(AdminSlots)({
  danger: AdminStyle.pieces.danger ?? Style.empty,
}).css

it.each([
  ['a tab', tab],
  ['a toolbar button', button],
  ["a toolbar's danger button", danger],
])('%s takes a finger: 44px both ways, where the pointer is coarse', (_name, css) => {
  expect(css).toContain('(pointer: coarse)')
  expect(css).toContain('min-height:2.75rem')
  expect(css).toContain('min-width:2.75rem')
})
