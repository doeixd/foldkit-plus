/**
 * The same search field placed twice. The parent owns each value; a child
 * sends Messages through its placement and its update changes only its slice.
 * The same child view, recipe and Behavior are used by both placements.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Attr, Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'

export const SearchModel = Schema.Struct({ id: Schema.String, value: Schema.String })
export type SearchModel = typeof SearchModel.Type
export const SearchMessage = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
})
export type SearchMessage = typeof SearchMessage.Type

export const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

// The input's shipped recipe is extended, not copied; the child owns its slots.
const SearchInputRecipe = Recipes.Input.extend({ base: { input: Style.class('search-input') } })
const SearchInputStyle = Style.forSlots(InputSlots)(SearchInputRecipe({}))
const ClearLabel = Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>(
  {
    clear: Behavior.slot({
      attributes: ({ h }) => [h.AriaLabel('Clear search')],
    }),
  },
  { name: 'ClearLabel' },
)

export const SearchView = SlotView.forMessages<SearchMessage>()
  .define(SearchSlots, (model: SearchModel, slots, h) =>
    h.div(slots.root.attrs(), [
      Input.view(
        {
          id: model.id,
          value: model.value,
          onInput: value => SearchMessage.Typed({ value }),
          type: 'search',
          style: SearchInputStyle,
          draw: ({ input }, h) => h.input([...input, h.AriaLabel('Search')]),
        },
        h,
      ),
      h.button(slots.clear.attrs([h.Type('button'), h.OnClick(SearchMessage.Cleared())]), [
        'Clear',
      ]),
    ]),
  )
  .pipe(Behavior.attach(ClearLabel))

export const Search = Bundle.make('Search', {
  Model: SearchModel,
  Message: SearchMessage,
  args: Schema.Struct({ id: Schema.String }),
  init: ({ id }) => ({ model: { id, value: '' } }),
  update: (model, message) =>
    SearchMessage.match(message, {
      Typed: ({ value }) =>
        value === model.value ? { model } : { model: modifyFields(model, { value: () => value }) },
      Cleared: () =>
        model.value === '' ? { model } : { model: modifyFields(model, { value: () => '' }) },
    }),
  view: Submodel.defineView<SearchModel, SearchMessage>(SearchView),
})

const First = Bundle.declare(Search, 'first')
const Second = Bundle.declare(Search, 'second')
export const Model = Schema.Struct({ ...First.fields, ...Second.fields })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...First.cases, ...Second.cases })
export type Message = typeof Message.Type
const Parent = Bundle.parent({ Model, Message })
const first = Parent.at(First, { args: { id: 'first-search' } })
const second = Parent.at(Second, { args: { id: 'second-search' } })
const placements = Parent.assemble(first, second)
export const initial: Model = placements.initial({}).model
export const update = placements.update()
export const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      h.section([h.Id('first')], [first.view(model, h)]),
      h.section([h.Id('second')], [second.view(model, h)]),
    ],
  )
