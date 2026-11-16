import { DatePickerSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('date-picker'),
  DatePickerSlots,
  Recipes.DatePicker,
  (style, live) =>
    Snippet.datePicker(
      style,
      live.widgets,
      message => live.onWidget(Widgets.Message.GotDatePicker({ message })),
      live.h,
    ),
  undefined,
  [
    {
      name: 'single',
      title: 'A day',
      draw: (style, live) =>
        Snippet.datePicker(
          style,
          live.widgets,
          message => live.onWidget(Widgets.Message.GotDatePicker({ message })),
          live.h,
        ),
    },
    {
      name: 'range',
      title: 'A range',
      draw: (style, live) =>
        Snippet.datePickerRange(
          style,
          { picker: live.widgets.stayPicker, range: live.widgets.stayDates },
          message => live.onWidget(Widgets.Message.GotStayPicker({ message })),
          live.h,
        ),
    },
  ],
)
