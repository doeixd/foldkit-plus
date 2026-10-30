/**
 * A picker: the Listbox's dropdown at or above the theme's `sheetBelow`
 * breakpoint (`sm`, `md` or `lg`; default `md`), and below it the opener,
 * which looks as the Listbox's trigger does (`trigger`: `outline`, `filled`,
 * `ghost`), and a Sheet of options laid out as the Listbox's rows, the
 * chosen one tinted. The half not shown is `display: none`. `size` steps the
 * trigger, the opener and the Sheet's rows together. Style the Listbox with
 * `Recipes.Listbox` and the Sheet with `Recipes.Sheet`, passed as the view's
 * `listbox` and `sheet`.
 */
import { Style } from 'foldkit-mixins'
import { ladder, Theme } from 'foldkit-mixins/theme'
import { PickerSlots } from '../picker.js'
import { component, focusRing, ref, steps, variant } from './design.js'
import { trigger, triggerLooks } from './listbox.js'
import { item, unlit } from './popup.js'

/** Below a breakpoint of the theme: where the Sheet's half shows. */
const below = (name: 'sm' | 'md' | 'lg') => `@media not all and ${Theme.tokens.breakpoint[name]}`

const sheetBelow = (name: 'sm' | 'md' | 'lg') => ({
  dropdown: variant(Style.at(below(name), Style.self({ display: 'none' }))),
  opener: variant(
    Style.self({ display: 'none' }),
    Style.at(below(name), Style.self({ display: 'flex' })),
  ),
})

export const Picker = Style.recipeFor(PickerSlots)({
  base: {
    root: component(Style.self({ display: 'inline-block' })),
    dropdown: component(Style.self({ display: 'block' })),
    opener: trigger,
    list: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        paddingBlock: ref.space.xs,
      }),
    ),
    option: component(
      item,
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]`, { background: ref.accent.subtle }),
      Style.self({ minBlockSize: ladder('height') }),
      focusRing,
    ),
  },
  variants: {
    sheetBelow: { sm: sheetBelow('sm'), md: sheetBelow('md'), lg: sheetBelow('lg') },
    trigger: {
      outline: {},
      filled: { opener: triggerLooks.filled },
      ghost: { opener: triggerLooks.ghost },
    },
    size: { sm: { root: steps.sm }, md: { root: steps.md }, lg: { root: steps.lg } },
  },
  defaults: { sheetBelow: 'md', trigger: 'outline' },
})
