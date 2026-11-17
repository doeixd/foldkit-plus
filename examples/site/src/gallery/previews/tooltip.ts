import type * as UiTooltip from '@foldkit/ui/tooltip'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { TooltipSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fixed } from '../define.js'
import type { Live } from '../showcase.js'

const tooltipAt =
  (
    example: Widgets.TooltipExample,
    draw: <Message>(
      style: NamedStyle<typeof TooltipSlots>,
      model: UiTooltip.Model,
      toMessage: (message: UiTooltip.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(live: Live<Message>) =>
    draw(
      Snippet.TooltipStyle,
      live.widgets.tooltips[example],
      message => live.onWidget(Widgets.Message.GotTooltip({ example, message })),
      live.h,
    )

export const showcase = fixed(about('tooltip'), tooltipAt('above', Snippet.tooltip), [
  { name: 'above', title: 'Above', draw: tooltipAt('above', Snippet.tooltip) },
  { name: 'right', title: 'Right', draw: tooltipAt('right', Snippet.tooltipRight) },
  { name: 'edge', title: 'At the edge', draw: tooltipAt('edge', Snippet.tooltipEdge) },
])
