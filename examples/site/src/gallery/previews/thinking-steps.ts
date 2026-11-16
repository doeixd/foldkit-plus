import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ThinkingStepsSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const thoughtSteps = <Message>(style: NamedStyle<typeof ThinkingStepsSlots>, live: Live<Message>) =>
  Snippet.thinkingSteps(
    style,
    live.widgets.thought,
    open => live.onWidget(Widgets.Message.ToggledThought({ open })),
    live.h,
  )

export const showcase = fromRecipe(
  about('thinking-steps'),
  ThinkingStepsSlots,
  Recipes.ThinkingSteps,
  thoughtSteps,
  undefined,
  [
    { name: 'basic', title: 'Done', draw: thoughtSteps },
    {
      name: 'running',
      title: 'Running',
      draw: (style, live) =>
        Snippet.thinkingStepsRunning(
          style,
          live.widgets.thinking,
          open => live.onWidget(Widgets.Message.ToggledThinking({ open })),
          live.h,
        ),
    },
    {
      name: 'tools',
      title: 'Tool calls',
      pins: { variant: 'card' },
      draw: (style, live) =>
        Snippet.thinkingStepsTools(
          style,
          live.widgets.toolsOpen,
          open => live.onWidget(Widgets.Message.ToggledTools({ open })),
          live.widgets.toolSteps,
          id => live.onWidget(Widgets.Message.ToggledToolStep({ id })),
          live.h,
        ),
    },
  ],
)
