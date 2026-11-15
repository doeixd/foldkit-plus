import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { ChoicesSlots } from './view.js'

const { t } = AppStyle.make({})

export const choicesStyle = (slots: typeof ChoicesSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: t.space.lg, maxInlineSize: '24rem' }),
      readout: Style.self({ display: 'grid', gap: t.space['2xs'] }),
      line: Style.self({ margin: '0' }),
    },
    { name: 'ShowcaseChoices' },
  )
