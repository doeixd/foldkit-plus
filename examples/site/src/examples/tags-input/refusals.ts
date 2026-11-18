import { Bundles, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Type a tag the field holds already: the refusal is said in your words.
export default example({
  title: 'Refusals',
  slots: TagsInputSlots,
  recipe: Recipes.TagsInput,
  state: Bundles.TagsInput.with({ id: 'refusals', tags: ['effect', 'foldkit'] }),
  view: ({ style, model, onMessage, h }) =>
    TagsInput.view(
      {
        model,
        onMessage,
        label: 'Topics',
        placeholder: 'Type effect again',
        refusalText: refusal =>
          TagsInput.Refusal.match(refusal, {
            Repeat: ({ tag }) => `“${tag}” is on the list already.`,
            Empty: () => 'Type a topic first.',
            Full: ({ max }) => `That makes more than ${max}.`,
          }),
        style,
      },
      h,
    ),
})
