import type { NamedStyle } from 'foldkit-mixins'
import { TagsInputSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const tagsBasic = <Message>(style: NamedStyle<typeof TagsInputSlots>, live: Live<Message>) =>
  Snippet.tagsInput(
    style,
    live.widgets.tags,
    message => live.onWidget(Widgets.Message.GotTags({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('tags-input'),
  TagsInputSlots,
  Recipes.TagsInput,
  tagsBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: tagsBasic },
    {
      name: 'max',
      title: 'A maximum',
      draw: (style, live) =>
        Snippet.tagsInputMax(
          style,
          live.widgets.tagsMax,
          message => live.onWidget(Widgets.Message.GotTagsMax({ message })),
          live.h,
        ),
    },
    {
      name: 'refusals',
      title: 'Refusals',
      draw: (style, live) =>
        Snippet.tagsInputRefusals(
          style,
          live.widgets.tagsRefusals,
          message => live.onWidget(Widgets.Message.GotTagsRefusals({ message })),
          live.h,
        ),
    },
  ],
)
