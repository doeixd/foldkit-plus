import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('button'),
  ButtonSlots,
  Recipes.Button,
  style => Snippet.button(style, inert),
  // A square shows no words, which every example but the icons draws.
  ['tone', 'variant', 'size'],
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.button(style, inert) },
    {
      name: 'icon',
      title: 'Icon only',
      draw: style => Snippet.iconButtons(style, inert),
      pins: { tone: 'neutral', variant: 'icon' },
    },
    {
      name: 'toggle',
      title: 'Toggle',
      draw: (style, live) =>
        Snippet.toggleButtons(
          style,
          live.widgets.formats,
          format => live.onWidget(Widgets.Message.ToggledFormat({ format })),
          live.h,
        ),
    },
  ],
)
