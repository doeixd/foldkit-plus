import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import type { GoToSlots } from './view.js'

const { t } = AppStyle.make({})

const focus = Style.pseudo(':focus-visible', {
  outline: `${t.border.thick} solid ${t.outline.focus}`,
  outlineOffset: '2px',
})

const field = Style.self({
  font: 'inherit',
  color: t.text.overt,
  background: t.surface.base,
  border: `${t.border.thin} solid ${t.outline.default}`,
  borderRadius: t.radius.lg,
  paddingBlock: '0.375rem',
  paddingInline: '0.75rem',
})

export const goToStyle = (slots: typeof GoToSlots) =>
  Style.forSlots(slots)(
    {
      form: Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        paddingBlockEnd: '0.5rem',
      }),
      label: Style.self({ fontWeight: '600' }),
      input: Style.compose(field, Style.self({ inlineSize: '6rem' }), focus),
      go: Style.compose(field, Style.self({ cursor: 'pointer' }), focus),
    },
    { name: 'ShowcaseWindowListGoTo' },
  )
