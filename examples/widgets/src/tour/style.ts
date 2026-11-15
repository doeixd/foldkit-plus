/** The section's layout; its Tour, Floating panel and Buttons are `Recipes`, selected in `view.ts`. */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { TourIslandSlots } from './view.js'

const { t } = AppStyle.make({})

export const tourIslandStyle = (slots: typeof TourIslandSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: t.space.md, justifyItems: 'start' }),
      openers: Style.self({ display: 'flex', flexWrap: 'wrap', gap: t.space.sm }),
      targets: Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: t.space.sm,
      }),
      status: Style.self({ margin: '0', color: t.text.muted }),
      notes: Style.self({ margin: '0' }),
    },
    { name: 'ShowcaseTour' },
  )
