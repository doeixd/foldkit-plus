import { Bundles, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// One hidden input per tag under `name`, so a form submits the list.
// Backspace in an empty field and the arrows move between the chips.
export default example({
  title: 'Basic',
  slots: TagsInputSlots,
  recipe: Recipes.TagsInput,
  state: Bundles.TagsInput.with({ id: 'topics', tags: ['effect', 'foldkit'] }),
  view: ({ style, model, onMessage, h }) =>
    TagsInput.view(
      { model, onMessage, label: 'Topics', placeholder: 'Add a topic', name: 'topics', style },
      h,
    ),
})
