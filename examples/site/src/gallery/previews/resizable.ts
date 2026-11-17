import type { NamedStyle } from 'foldkit-mixins'
import { ResizableSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const resizableBasic = <Message>(style: NamedStyle<typeof ResizableSlots>, live: Live<Message>) =>
  Snippet.resizable(
    style,
    live.widgets.split,
    message => live.onWidget(Widgets.Message.GotSplit({ message })),
    live.direction,
    live.h,
  )

export const showcase = fromRecipe(
  about('resizable'),
  ResizableSlots,
  Recipes.Resizable,
  resizableBasic,
  undefined,
  [
    { name: 'basic', title: 'Side by side', draw: resizableBasic },
    {
      name: 'collapsible',
      title: 'A collapsible sidebar',
      draw: (style, live) =>
        Snippet.resizableCollapsible(
          style,
          live.widgets.collapsibleSplit,
          message => live.onWidget(Widgets.Message.GotCollapsibleSplit({ message })),
          live.h,
        ),
      pins: { handle: 'grip' },
    },
    {
      name: 'nested',
      title: 'Nested both ways',
      draw: (style, live) =>
        Snippet.resizableNested(
          style,
          live.widgets.outerSplit,
          live.widgets.innerSplit,
          message => live.onWidget(Widgets.Message.GotOuterSplit({ message })),
          message => live.onWidget(Widgets.Message.GotInnerSplit({ message })),
          live.h,
        ),
    },
  ],
)
