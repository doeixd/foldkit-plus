import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { MenuRowsSlots } from './view.js'

const { t } = AppStyle.make({})

export const menuRowsStyle = (slots: typeof MenuRowsSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: t.space.md, justifyItems: 'start' }),
      result: Style.self({ margin: '0' }),
      trigger: Style.self({ font: 'inherit' }),
    },
    { name: 'ShowcaseMenuRows' },
  )
