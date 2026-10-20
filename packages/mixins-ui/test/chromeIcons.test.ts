/**
 * Each icon a component draws itself comes from the theme's `icon` tokens, by
 * its name, where the component draws it: so a pack the application gives
 * reaches every one, and one component's icon is never another's.
 */
import { Style } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { ColorPickerSlots, ImageCropperSlots, Recipes, ToastSlots } from '../src/index.js'

/** The declarations of the rule whose selector ends with `selector`, in `css`. */
const ruleEnding = (css: string, selector: string): string => {
  const at = css.indexOf(`${selector}{`)
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('the components’ own icons', () => {
  it('the eyedropper draws the pipette', () => {
    const { css } = Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
    expect(css).toContain('var(--fk-icon-pipette)')
  })

  it('the cropper turns left with a left turn and right with a right one', () => {
    const { css } = Style.forSlots(ImageCropperSlots)(Recipes.ImageCropper({}))
    expect(ruleEnding(css, '[data-turn="right"]::before')).toContain('var(--fk-icon-rotate-cw)')
    expect(css).toContain('var(--fk-icon-rotate-ccw)')
  })

  it.each(['success', 'error', 'warning', 'info'])(
    'a %s toast is marked with its own icon',
    type => {
      const { css } = Style.forSlots(ToastSlots)(Recipes.Toast({}))
      expect(ruleEnding(css, `[data-type="${type}"]:empty::before`)).toContain(
        `var(--fk-icon-${type})`,
      )
    },
  )

  it('a toast closes with the close icon', () => {
    const { css } = Style.forSlots(ToastSlots)(Recipes.Toast({}))
    expect(css).toContain('var(--fk-icon-close)')
  })
})
