/**
 * The form controls the Input, Textarea, Checkbox and Fieldset pages share:
 * the shipped recipes, rounder and with upstream's smaller labels, so one
 * control looks the same on every page it appears on.
 */
import { Style } from 'foldkit-mixins'
import { CheckboxSlots, InputSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'

const control = Style.self({ borderRadius: t.radius.lg })

const label = Style.self({ margin: '0', color: t.text.default })

const description = Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted })

export const FieldInputStyle = forSlots(InputSlots)(
  Recipes.Input.extend({ base: { input: control, label, description } })(),
  { name: 'FieldInputStyle' },
)

export const FieldTextareaStyle = forSlots(TextareaSlots)(
  Recipes.Textarea.extend({ base: { textarea: control, label, description } })(),
  { name: 'FieldTextareaStyle' },
)

export const FieldCheckboxStyle = forSlots(CheckboxSlots)(
  Recipes.Checkbox.extend({
    base: {
      label: Style.self({ fontSize: t.size.sm, color: t.text.overt, userSelect: 'none' }),
      description,
    },
  })({ size: 'lg' }),
  { name: 'FieldCheckboxStyle' },
)

/** The column a label, its control and its description stand in. */
export const field = Style.self({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  width: '100%',
})

/** A checkbox beside its label. */
export const checkRow = Style.self({ display: 'flex', alignItems: 'center', gap: t.space.xs })

/** A demo's column of fields, as wide as upstream's `max-w-sm`. */
export const demoColumn = Style.self({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: t.space.xs,
  maxWidth: '24rem',
})
