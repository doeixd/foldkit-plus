import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { CheckboxGroupSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** A checkbox group example on its own alerts of the widgets' Model. */
const alertsOf =
  (
    draw: <Message>(
      style: NamedStyle<typeof CheckboxGroupSlots>,
      checked: ReadonlyArray<string>,
      onToggle: (value: string) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
    example: Widgets.AlertsExample,
  ) =>
  <Message>(style: NamedStyle<typeof CheckboxGroupSlots>, live: Live<Message>): Html =>
    draw(
      style,
      live.widgets.alerts[example],
      value => live.onWidget(Widgets.Message.ToggledAlert({ example, value })),
      live.h,
    )

export const showcase = fromRecipe(
  about('checkbox-group'),
  CheckboxGroupSlots,
  Recipes.CheckboxGroup,
  alertsOf(Snippet.checkboxGroup, 'alerts'),
  undefined,
  [
    { name: 'alerts', title: 'Alerts', draw: alertsOf(Snippet.checkboxGroup, 'alerts') },
    {
      name: 'described',
      title: 'Descriptions',
      draw: alertsOf(Snippet.checkboxGroupDescribed, 'described'),
    },
    {
      name: 'select-all',
      title: 'Select all',
      draw: (style, live) =>
        Snippet.checkboxGroupSelectAll(
          style,
          live.widgets.alerts['select-all'],
          value => live.onWidget(Widgets.Message.ToggledAlert({ example: 'select-all', value })),
          values => live.onWidget(Widgets.Message.SetAlerts({ example: 'select-all', values })),
          live.h,
        ),
    },
    {
      name: 'invalid',
      title: 'Invalid',
      draw: alertsOf(Snippet.checkboxGroupInvalid, 'invalid'),
    },
  ],
)
