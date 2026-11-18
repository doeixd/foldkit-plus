import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { FileUploadFormSlots } from './view.js'

const t = AppStyle.make({}).t

export const uploadFormStyle = (slots: typeof FileUploadFormSlots) =>
  Style.forSlots(slots)(
    {
      form: Style.self({
        display: 'grid',
        gap: t.space.md,
        justifyItems: 'stretch',
        maxInlineSize: '32rem',
      }),
      receipt: Style.self({ margin: '0', color: t.text.muted }),
    },
    { name: 'ShowcaseFileUploadForm' },
  )
