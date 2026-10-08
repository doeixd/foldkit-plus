/**
 * A thematic break: a hairline along the layout axis, never interactive.
 * The orientation axis mirrors the view option so the rule and the role
 * agree; anything else is a second owner of the same fact.
 */
import { Style } from 'foldkit-mixins'
import { SeparatorSlots } from '../separator.js'
import { component, ref, variant } from './design.js'

export const Separator = Style.recipeFor(SeparatorSlots)({
  base: {
    rule: component(
      Style.self({
        border: '0',
        background: ref.outline.subtle,
        flex: 'none',
      }),
    ),
  },
  variants: {
    orientation: {
      horizontal: {
        rule: variant(Style.self({ inlineSize: '100%', blockSize: ref.border.thin })),
      },
      vertical: {
        rule: variant(
          Style.self({ inlineSize: ref.border.thin, blockSize: '100%', alignSelf: 'stretch' }),
        ),
      },
    },
  },
  defaults: { orientation: 'horizontal' },
})
