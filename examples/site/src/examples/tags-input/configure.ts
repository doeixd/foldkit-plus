import { Bundles, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Given once: what every tags field of the application shares. A field that
// is left with text in it adds the tag, and its remove buttons say so in
// the application's words.
const Tags = TagsInput.configure({
  base: { addOnBlur: true, placeholder: 'Add and press Enter', words: { mark: '✕' } },
  presets: { people: { placeholder: 'Add a person', words: { remove: tag => `Uninvite ${tag}` } } },
})

export default example({
  title: 'Configure once',
  slots: TagsInputSlots,
  recipe: Recipes.TagsInput,
  state: Bundles.TagsInput.with({ id: 'invited', tags: ['ada', 'grace'] }),
  view: ({ style, model, onMessage, h }) =>
    Tags.view({ model, onMessage, label: 'Invited', preset: 'people', style }, h),
})
