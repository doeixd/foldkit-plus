/**
 * The search field of `view.ts` without the binder: every Behavior factory and
 * the view name `Model` and `Message` again. It exists to be compared with the
 * bound form (the README's type-cost table); nothing draws it.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Style, SlotView } from 'foldkit-mixins'
import { FocusRecovery, ListNavigation, RovingTabindex } from 'foldkit-primitives/interaction'
import { Message, Nav, navArgs, resultId, resultsOf, type Model } from './app.js'
import { SearchSlots, SearchStyle } from './view.js'

const { Keys } = Behaviors

const items = (model: Model) =>
  Behaviors.Collection.of(resultsOf(model), { id: fruit => resultId(model.id, fruit) })

const keys = Keys.behavior(SearchSlots)<Model, Message>({
  slot: 'input',
  name: 'SearchKeys',
  routes: [
    Keys.route<Model, Message>('EscapeClears', {
      on: [Keys.chord('Escape')],
      handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
    }),
    Keys.route<Model, Message>('EnterPicks', {
      on: [Keys.chord('Enter')],
      handle: ({ input }) => {
        const id = input.results.current
        return id !== null && items(input).indexOf(id) !== -1
          ? Option.some(Message.Picked({ id }))
          : Option.none()
      },
    }),
    ListNavigation.keys(
      Nav,
      navArgs,
    )<Model, Message>({
      items,
      text: () => '',
      typeahead: false,
    }),
  ],
})

const pointing = Behavior.forSlots(SearchSlots)<Model, Message>(
  {
    input: Behavior.slot({
      attributes: ({ input, h }) => {
        const { current } = input.results
        const id = current !== null && items(input).indexOf(current) !== -1 ? current : undefined
        return id === undefined ? [] : [h.AriaActiveDescendant(id)]
      },
    }),
    option: Behavior.slot({
      attributes: ({ input, h, item }) =>
        item === undefined
          ? []
          : [
              ...RovingTabindex.itemAttributes(
                h,
                items(input),
                input.results.current,
                item,
                true,
                id => Nav.wrapper.make(ListNavigation.Message.Focused({ id })),
              ),
              ...(item.id === input.results.current ? [h.DataAttribute('active', '')] : []),
            ],
    }),
  },
  { name: 'Pointing' },
)

const ids = Behaviors.Collection.behavior(SearchSlots)<Model, Message>({
  item: 'option',
  items,
})

const recovers = FocusRecovery.behavior(SearchSlots)<Model, Message>({
  owner: 'root',
  parts: { input: [], clear: [{ part: 'input' }], option: ['next', 'previous', { part: 'input' }] },
})

export const ExplicitSearchField = SlotView.forMessages<Message>()
  .define(SearchSlots, (model: Model, slots, h) => {
    const shown = resultsOf(model)
    const rows = items(model)
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
              rows.slotItem(index),
            ),
            [fruit],
          ),
        ),
      ),
      h.p(slots.status.attrs([h.Role('status')]), [
        Option.match(model.picked, { onNone: () => '', onSome: fruit => `Picked ${fruit}.` }),
      ]),
    ])
  })
  .pipe(
    Behavior.attach(keys),
    Behavior.attach(pointing),
    Behavior.attach(ids),
    Behavior.attach(recovers),
    Style.attach(SearchStyle),
  )
