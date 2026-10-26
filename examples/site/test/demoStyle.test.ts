/**
 * The demos' look: two themes by name, the standard shown first, and the
 * compact one writing tighter knobs only where the root names it.
 */
import { expect, test } from 'vitest'
import { demoStyle, demoThemes } from '../src/demoStyle.js'

test('the standard theme shows first, and the compact one tightens only under its name', () => {
  expect(demoThemes.names).toEqual(['standard', 'compact'])
  expect(demoThemes.initial).toBe('standard')
  const css = demoStyle.stylesheet
  const compact = /:root\[data-theme="compact"\]\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(compact).toContain('--fk-knob-density:0.85')
  // The root keeps the standard density, so a page without the attribute is not compact.
  expect(css).not.toMatch(/:root\{[^}]*--fk-knob-density:0\.85/)
})
