import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { TagsFormSlots } from './view.js'

const t = AppStyle.make({}).t

export const tagsFormStyle = (slots: typeof TagsFormSlots) =>
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
    { name: 'ShowcaseTagsForm' },
  )
