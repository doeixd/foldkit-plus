/**
 * Tabs: the selected tab is `aria-selected`, which `@foldkit/ui` writes.
 * `variant` is an underline under a rule or a pill in a tray; `size` the
 * density of each tab.
 */
import { Style } from 'foldkit-mixins'
import { TabsSlots } from '../tabs.js'
import { component, disabled, focusRing, token, transition, variant, hover } from './design.js'

const selected = '[aria-selected="true"]'

const size = (block: string, inline: string, font: string) =>
  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

export const Tabs = Style.recipeFor(TabsSlots)({
  base: {
    tablist: component(Style.self({ display: 'flex', gap: token('space', '2xs') })),
    tab: component(
      Style.self({
        border: '0',
        background: 'transparent',
        color: token('text', 'muted'),
        font: 'inherit',
        fontWeight: token('weight', 'medium'),
        cursor: 'pointer',
        ...transition('background-color, color, box-shadow'),
      }),
      hover({ color: token('text', 'overt') }),
      Style.pseudo(selected, { color: token('text', 'overt') }),
      focusRing,
      disabled,
    ),
    panel: component(Style.self({ paddingBlock: token('space', 'md') })),
  },
  variants: {
    variant: {
      line: {
        tablist: variant(
          Style.self({
            boxShadow: `inset 0 calc(-1 * ${token('border', 'thin')}) 0 ${token('outline', 'default')}`,
          }),
        ),
        tab: variant(
          Style.pseudo(selected, {
            boxShadow: `inset 0 calc(-1 * ${token('border', 'thick')}) 0 ${token('accent', 'default')}`,
          }),
        ),
      },
      pill: {
        tablist: variant(
          Style.self({
            inlineSize: 'fit-content',
            padding: token('space', '3xs'),
            borderRadius: token('radius', 'lg'),
            background: token('surface', 'muted'),
          }),
        ),
        tab: variant(
          Style.self({ borderRadius: token('radius', 'md') }),
          Style.pseudo(selected, { background: token('surface', 'base') }),
        ),
      },
    },
    size: {
      sm: { tab: size(token('space', '2xs'), token('space', 'sm'), token('size', 'sm')) },
      md: { tab: size(token('space', 'xs'), token('space', 'md'), token('size', 'md')) },
    },
  },
  defaults: { variant: 'line', size: 'md' },
})
