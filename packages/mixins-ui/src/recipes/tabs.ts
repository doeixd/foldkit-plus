/**
 * Tabs: the selected tab is `aria-selected`, which `@foldkit/ui` writes.
 * `variant` is an underline under a rule or a pill in a tray; `size` the
 * density of each tab.
 */
import { Style } from 'foldkit-mixins'
import { TabsSlots } from '../tabs.js'
import { component, disabled, focusRing, ref, transition, variant, hover } from './design.js'

const selected = '[aria-selected="true"]'

const size = (block: string, inline: string, font: string) =>
  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

export const Tabs = Style.recipeFor(TabsSlots)({
  base: {
    tablist: component(Style.self({ display: 'flex', gap: ref.space['2xs'] })),
    tab: component(
      Style.self({
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, color, box-shadow'),
      }),
      hover({ color: ref.text.overt }),
      Style.pseudo(selected, { color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    panel: component(Style.self({ paddingBlock: ref.space.md })),
  },
  variants: {
    variant: {
      line: {
        tablist: variant(
          Style.self({
            boxShadow: `inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.outline.default}`,
          }),
        ),
        tab: variant(
          Style.pseudo(selected, {
            boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
          }),
        ),
      },
      pill: {
        tablist: variant(
          Style.self({
            inlineSize: 'fit-content',
            padding: ref.space['3xs'],
            borderRadius: ref.radius.lg,
            background: ref.surface.muted,
          }),
        ),
        tab: variant(
          Style.self({ borderRadius: ref.radius.md }),
          Style.pseudo(selected, { background: ref.surface.base }),
        ),
      },
    },
    size: {
      sm: { tab: size(ref.space['2xs'], ref.space.sm, ref.size.sm) },
      md: { tab: size(ref.space.xs, ref.space.md, ref.size.md) },
    },
  },
  defaults: { variant: 'line', size: 'md' },
})
