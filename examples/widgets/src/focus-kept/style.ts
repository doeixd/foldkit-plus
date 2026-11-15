/** The section's layout; its Alerts, Cards, Buttons and Toasts are `Recipes`, selected in `view.ts`. */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { FocusKeptSlots } from './view.js'

const { t } = AppStyle.make({})

export const focusKeptStyle = (slots: typeof FocusKeptSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: t.space.lg }),
      group: Style.self({ display: 'grid', gap: t.space.sm, justifyItems: 'start' }),
      heading: Style.self({ margin: '0' }),
      list: Style.self({
        display: 'grid',
        gap: t.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
        inlineSize: 'min(100%, 28rem)',
      }),
      toasts: Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: t.space.sm,
      }),
    },
    { name: 'ShowcaseFocusKept' },
  )
