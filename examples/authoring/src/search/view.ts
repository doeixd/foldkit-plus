/**
 * The search field, assembled: one binder names its slots, input and Messages
 * once, and every Behavior is made through it. The keys of the input are one
 * `Keys` owner built from three routes (Escape clears, Enter picks, arrows
 * move the result the keyboard is on), since a second attachment writing
 * `keydown` would be refused. `explicit.ts` writes the same view without the
 * binder, for the type-cost comparison in the README.
 */
import { Option } from 'effect'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { FocusRecovery, ListNavigation, RovingTabindex } from 'foldkit-primitives/interaction'
import { active, control, focus, panel, t } from '../style.js'
import { Message, Nav, fruitOf, navArgs, resultId, resultsOf, type Model } from './app.js'

const { Keys } = Behaviors

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

/** The results as one Collection, so identity, order and the keys agree. */
export const itemsOf = (model: Model) =>
  Behaviors.Collection.of(resultsOf(model), { id: fruit => resultId(model.id, fruit) })

const Search = SlotView.over(SearchSlots)<Model, Message>()

/** Escape clears what was typed; with nothing typed it is the page's. */
const escapeClears = Keys.route<Model, Message>('EscapeClears', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
})

const enterPicks = Keys.route<Model, Message>('EnterPicks', {
  on: [Keys.chord('Enter')],
  handle: ({ input }) => {
    const id = input.results.current
    return id !== null && itemsOf(input).indexOf(id) !== -1
      ? Option.some(Message.Picked({ id }))
      : Option.none()
  },
})

/** ListNavigation's arrows as a route, listed beside the two above: one owner of `keydown`. */
const arrows = ListNavigation.keys(
  Nav,
  navArgs,
)<Model, Message>({
  items: itemsOf,
  text: () => '',
  typeahead: false,
})

export const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  name: 'SearchKeys',
  routes: [escapeClears, enterPicks, arrows],
})

/**
 * `aria-activedescendant` on the input once the keyboard has a result, and that
 * result's mark on the option. Before the first arrow nothing is current: the
 * field announces no result it has not moved to.
 */
export const Pointing = Search.behavior(
  {
    input: {
      attributes: ({ input, h }) => {
        const { current } = input.results
        const id = current !== null && itemsOf(input).indexOf(current) !== -1 ? current : undefined
        return id === undefined ? [] : [h.AriaActiveDescendant(id)]
      },
    },
    option: {
      attributes: ({ input, h, item }) =>
        item === undefined
          ? []
          : [
              ...RovingTabindex.itemAttributes(
                h,
                itemsOf(input),
                input.results.current,
                item,
                true,
                id => Nav.wrapper.make(ListNavigation.Message.Focused({ id })),
              ),
              ...(item.id === input.results.current ? [h.DataAttribute('active', '')] : []),
            ],
    },
  },
  { name: 'Pointing' },
)

/** The ids the options carry, from the Collection. */
const Ids = Behaviors.Collection.behavior(Search)({ item: 'option', items: itemsOf })

/**
 * Focus survives the clear button leaving with the text, and a result leaving
 * with the query: it goes to the input, or to the next result first.
 */
export const Recovers = FocusRecovery.behavior(Search)({
  owner: 'root',
  parts: { input: [], clear: [{ part: 'input' }], option: ['next', 'previous', { part: 'input' }] },
})

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

export const SearchField = Search.define((model, slots, h) => {
  const shown = resultsOf(model)
  const items = itemsOf(model)
  const listId = `${model.id}:list`
  return h.div(slots.root.attrs(), [
    h.input(
      slots.input.attrs([
        h.Id(`${model.id}:input`),
        h.Type('search'),
        h.Role('combobox'),
        h.AriaLabel('Search fruit'),
        h.AriaExpanded(shown.length > 0),
        h.AriaControls(listId),
        h.AriaAutocomplete('list'),
        h.Value(model.query),
        h.OnInput(text => Message.Typed({ text })),
      ]),
    ),
    ...(model.query === ''
      ? []
      : [
          h.button(
            slots.clear.attrs([
              h.Type('button'),
              h.AriaLabel('Clear search'),
              h.OnClick(Message.Cleared()),
            ]),
            ['×'],
          ),
        ]),
    h.ul(
      slots.list.attrs([
        h.Id(listId),
        h.Role('listbox'),
        h.AriaLabel('Results'),
        ...(shown.length === 0 ? [h.Hidden(true)] : []),
      ]),
      shown.map((fruit, index) =>
        h.li(
          slots.option.attrs(
            [
              h.Key(resultId(model.id, fruit)),
              h.Role('option'),
              h.OnClick(Message.Picked({ id: resultId(model.id, fruit) })),
            ],
            items.slotItem(index),
          ),
          [fruit],
        ),
      ),
    ),
    h.p(slots.status.attrs([h.Role('status')]), [
      Option.match(model.picked, { onNone: () => '', onSome: fruit => `Picked ${fruit}.` }),
    ]),
  ])
}).pipe(
  Behavior.attach(SearchKeys),
  Behavior.attach(Pointing),
  Behavior.attach(Ids),
  Behavior.attach(Recovers),
  Style.attach(SearchStyle),
)

export { fruitOf }
