/** The section's layout; its Sheet and Button are `Recipes`, selected in `view.ts`. */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { SheetIslandSlots } from './view.js'

const { t } = AppStyle.make({})

export const sheetIslandStyle = (slots: typeof SheetIslandSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: t.space.md,
      }),
      status: Style.self({ margin: '0', color: t.text.muted }),
    },
    { name: 'ShowcaseSheet' },
  )
