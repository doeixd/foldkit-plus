import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { AppKeysSlots } from './view.js'

const { t } = AppStyle.make({})

export const appKeysStyle = (slots: typeof AppKeysSlots) =>
  Style.forSlots(slots)(
    {
      root: Style.self({ display: 'grid', gap: t.space.md, maxInlineSize: '32rem' }),
      note: Style.self({ color: t.text.muted, margin: '0' }),
      status: Style.self({ display: 'grid', gap: t.space['2xs'] }),
      line: Style.self({ margin: '0' }),
      clashes: Style.self({
        display: 'grid',
        gap: t.space.xs,
        margin: '0',
        paddingInline: '0',
        listStyle: 'none',
      }),
      clash: Style.self({
        color: t.text.muted,
        borderInlineStart: `${t.border.thick} solid ${t.outline.default}`,
        paddingInlineStart: t.space.sm,
      }),
    },
    { name: 'ShowcaseAppKeys' },
  )
