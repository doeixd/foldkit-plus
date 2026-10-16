/**
 * The Button recipe's press, read from its CSS: held, it gives a little by
 * the travel knob. The press on a real page is `press.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { ButtonSlots, Recipes } from '../src/index.js'

const css = (selection: Parameters<typeof Recipes.Button>[0]): string =>
  Style.forSlots(ButtonSlots)(Recipes.Button(selection)).css

describe('Button press', () => {
  it('gives a little while held, by the travel knob', () => {
    expect(css({})).toMatch(
      /@layer components\{[^@]*:active:not\(\[aria-disabled="true"\], :disabled\)\{scale:calc\(1 - 0\.02 \* var\(--fk-knob-travel\)\)\}/,
    )
  })
})
