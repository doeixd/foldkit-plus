/**
 * The same search field placed twice. The parent owns each value; a child
 * sends Messages through its placement and its update changes only its slice.
 * The same child view, recipe and Behavior are used by both placements.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import {
  Assembly,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { Input, InputSlots, Patterns, Recipes } from 'foldkit-mixins-ui'

export const SearchModel = Schema.Struct({
  id: Schema.String,
  value: Schema.String,
  resultsOpen: Schema.Boolean,
})
export type SearchModel = typeof SearchModel.Type
export const SearchMessage = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
  OpenedResults: {},
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
const SearchInputStyle = Style.forSlots(InputSlots)(SearchInputRecipe(), { name: 'SearchInput' })
const ClearLabel = Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>(
  {
    clear: Behavior.slot({
      attributes: ({ h }) => [h.AriaLabel('Clear search')],
    }),
  },
  { name: 'ClearLabel' },
)
const SearchKeys = Behaviors.Keyboard.behavior(InputSlots)<SearchModel, SearchMessage>({
  target: 'input',
  routes: [
    {
      name: 'Clear',
      key: 'Escape',
      toMessage: model =>
        model.value === '' ? Option.none() : Option.some(SearchMessage.Cleared()),
    },
    {
      name: 'Open results',
      key: 'ArrowDown',
      toMessage: () => Option.some(SearchMessage.OpenedResults()),
    },
  ],
})

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
          mixins: [SearchKeys.mixin],
          input: model,
          draw: ({ input }, h) => h.input([...input, h.AriaLabel('Search')]),
        },
        h,
      ),
      h.button(slots.clear.attrs([h.Type('button'), h.OnClick(SearchMessage.Cleared())]), [
        'Clear',
      ]),
      ...(model.resultsOpen
        ? [
            h.div(
              [h.Id(`${model.id}-results`), h.Role('region'), h.AriaLabel('Search results')],
              [`Results for ${model.value}`],
            ),
          ]
        : []),
    ]),
  )
  .pipe(Behavior.attach(ClearLabel))

export const Search = Bundle.make('Search', {
  Model: SearchModel,
  Message: SearchMessage,
  args: Schema.Struct({ id: Schema.String }),
  init: ({ id }) => ({ model: { id, value: '', resultsOpen: false } }),
  update: (model, message) =>
    SearchMessage.match(message, {
      Typed: ({ value }) =>
        value === model.value ? { model } : { model: modifyFields(model, { value: () => value }) },
      Cleared: () =>
        model.value === '' && !model.resultsOpen
          ? { model }
          : {
              model: modifyFields(model, { value: () => '', resultsOpen: () => false }),
            },
      OpenedResults: () =>
        model.resultsOpen ? { model } : { model: modifyFields(model, { resultsOpen: () => true }) },
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

/** The search field's slots, recipe, behaviors, and input pattern. One value for a document and a diagnostic. */
export const searchInspection = (input?: SearchModel): Assembly.Description =>
  Assembly.describe({
    name: 'Search',
    view: SearchView,
    behaviors: [ClearLabel],
    links: [{ kind: 'bundle', name: 'Search' }],
    parts: [
      {
        name: 'Input',
        slots: InputSlots,
        styles: [SearchInputStyle],
        behaviors: [SearchKeys],
        pattern: { name: 'input', pattern: Patterns.Input },
        ...(input === undefined ? {} : { input }),
      },
    ],
    ...(input === undefined ? {} : { input }),
  })

/** Draws a description. It does not walk the widget again. */
export const searchInspectionView = (description: Assembly.Description, h: HtmlBuilder<Message>) =>
  h.pre([h.Id('search-inspection')], [Assembly.textOf(description)])
