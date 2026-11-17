import type { Popover as UiPopover } from '@foldkit/ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const popoverAt =
  (
    example: Widgets.PopoverExample,
    draw: <Message>(
      style: NamedStyle<typeof PopoverSlots>,
      model: UiPopover.Model,
      toMessage: (message: UiPopover.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(style: NamedStyle<typeof PopoverSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.popovers[example],
      message => live.onWidget(Widgets.Message.GotPopover({ example, message })),
      live.h,
    )

export const showcase = fromRecipe(
  about('popover'),
  PopoverSlots,
  Recipes.Popover,
  popoverAt('below', Snippet.popover),
  undefined,
  [
    { name: 'below', title: 'Below', draw: popoverAt('below', Snippet.popover) },
    {
      name: 'top-start',
      title: 'Top start',
      draw: popoverAt('top-start', Snippet.popoverTopStart),
    },
    {
      name: 'no-arrow',
      title: 'No arrow',
      draw: popoverAt('no-arrow', Snippet.popover),
      pins: { arrow: 'none' },
    },
    {
      name: 'clipped',
      title: 'In a clipped card',
      draw: popoverAt('clipped', Snippet.popoverClipped),
    },
  ],
)
