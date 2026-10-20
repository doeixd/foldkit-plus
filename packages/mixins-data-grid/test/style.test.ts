/**
 * The grid's style reads the theme: a column that does not edit is marked with
 * the theme's `lock` icon, so a pack the application gives draws it too.
 */
import { GridStyle } from 'foldkit-mixins-data-grid'
import { expect, test } from 'vitest'

test('a column that does not edit is marked with the theme’s lock', () => {
  const at = GridStyle.css.indexOf('[aria-readonly="true"]::before{')
  expect(at).toBeGreaterThan(-1)
  expect(GridStyle.css.slice(at, GridStyle.css.indexOf('}', at))).toContain('var(--fk-icon-lock)')
})
