/**
 * The README's `toView` and `resolve` snippets, kept compiling.
 */
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Calendar, CalendarSlots, Input, InputSlots } from '../src/index.js'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Style.forSlots(ButtonSlots)({
  button: Style.class('btn btn-primary'),
})

export const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: Button.toView([SaveStyle.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
    },
    h,
  )

const ZipStyle = Style.forSlots(InputSlots)({ input: Style.class('zip') })

export const zipInput = (h: HtmlBuilder<Message>) =>
  UiInput.view(
    {
      id: 'zip',
      toView: Input.toView([ZipStyle.mixin], { h }, ({ input }) =>
        h.input([...input, h.Autocomplete('off')]),
      ),
    },
    h,
  )

const CalendarStyle = Style.forSlots(CalendarSlots)({
  root: Style.whenInput<CalendarAttributes['_tag']>(mode => mode === 'Years', Style.class('years')),
})

export const resolveCalendar = (attributes: CalendarAttributes, h: HtmlBuilder<Message>) =>
  Calendar.resolve(attributes, [CalendarStyle.mixin], { input: attributes._tag, h })
