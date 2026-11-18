import { Bundles, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// At most three: a fourth is refused, said under the field, and the field
// shakes once. The limit is the state's, so it is an arg and not a view option.
export default example({
  title: 'A maximum',
  slots: TagsInputSlots,
  recipe: Recipes.TagsInput,
  state: Bundles.TagsInput.with({ id: 'labels', tags: ['urgent', 'design'], max: 3 }),
  view: ({ style, model, onMessage, h }) =>
    TagsInput.view({ model, onMessage, label: 'Labels, up to three', style }, h),
})
