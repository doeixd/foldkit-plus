/**
 * What the two forms of the search field share: the slots, the Collection of
 * results and the look. Everything that differs between them (how the Behaviors
 * and the view name `Model` and `Message`) is in `view.ts` and `explicit.ts`.
 */
import { Behaviors, Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { active, control, focus, panel, t } from '../style.js'
import { resultId, resultsOf, type Model } from './app.js'

export const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.KeyDown],
  }),
  clear: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  list: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
  status: Slot.make({ capability: Capability.Container }),
})

type Results = Behaviors.Collection.Items<string>
const resultsByModel = new WeakMap<Model, Results>()

/**
 * The results as one Collection, so identity, order and the keys agree. Built
 * once per Model: every option a Behavior draws asks for it.
 */
export const itemsOf = (model: Model): Results => {
  const known = resultsByModel.get(model)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(resultsOf(model), {
    id: fruit => resultId(model.id, fruit),
  })
  resultsByModel.set(model, items)
  return items
}

/**
 * The look as a recipe: the default selection is what the field ships with,
 * `compact` is an application's override of it.
 */
export const SearchRecipe = Style.recipeFor(SearchSlots)({
  base: {
    root: Style.self({
      position: 'relative',
      display: 'inline-grid',
      gap: t.space['2xs'],
      inlineSize: '20rem',
    }),
    input: Style.compose(
      Style.self({ boxSizing: 'border-box', inlineSize: '100%', cursor: 'text' }),
      control,
      focus,
    ),
    clear: Style.compose(
      Style.self({
        position: 'absolute',
        insetBlockStart: t.space['2xs'],
        insetInlineEnd: t.space['2xs'],
      }),
      control,
      focus,
    ),
    list: Style.compose(panel, Style.self({ display: 'grid' })),
    option: Style.compose(
      Style.self({ paddingBlock: t.space.xs, paddingInline: t.space.sm, cursor: 'pointer' }),
      active,
    ),
    status: Style.self({ fontSize: t.size.sm, minBlockSize: '1.25rem' }),
  },
  variants: {
    density: {
      roomy: {},
      compact: {
        input: Style.self({ paddingBlock: t.space['3xs'] }),
        option: Style.self({ paddingBlock: t.space['3xs'] }),
      },
    },
  },
  defaults: { density: 'roomy' },
})

export const SearchStyle = Style.forSlots(SearchSlots)(SearchRecipe({}), { name: 'SearchStyle' })
export const CompactSearchStyle = Style.forSlots(SearchSlots)(
  SearchRecipe({ density: 'compact' }),
  {
    name: 'CompactSearchStyle',
  },
)
