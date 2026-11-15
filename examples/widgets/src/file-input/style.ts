import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { FileFormSlots } from './view.js'

const t = AppStyle.make({}).t

export const fileFormStyle = (slots: typeof FileFormSlots) =>
  Style.forSlots(slots)(
    {
      form: Style.self({
        display: 'grid',
        gap: t.space.md,
        justifyItems: 'start',
        maxInlineSize: '28rem',
      }),
      receipt: Style.self({ margin: '0', color: t.text.muted }),
    },
    { name: 'ShowcaseFileForm' },
  )
