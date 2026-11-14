/**
 * Compile-time contract of `Behaviors.Keys`: chords refuse a misspelt key
 * where they are written, and a router over a binder types its routes from it.
 * Type-checked, not executed.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from '../src/index.js'

const { Keys } = Behaviors

const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  internals: Slot.make({ capability: Capability.Base, hidden: true }),
})

interface SearchInput {
  readonly query: string
  readonly open: boolean
}

type Message = { readonly _tag: 'Cleared' } | { readonly _tag: 'Opened' }
const Cleared: Message = { _tag: 'Cleared' }

Keys.chord('Escape')
Keys.chord('a')
Keys.chord(' ')
Keys.chord('ArrowDown', { alt: true })
// A key known only at run time is checked there.
declare const typed: string
Keys.chord(typed)
// @ts-expect-error -- not a named key: `Escape` is
Keys.chord('Esc')
// @ts-expect-error -- two characters are no key
Keys.chord('ab')
// @ts-expect-error -- nothing is no key
Keys.chord('')

// @ts-expect-error -- a route takes at least one gesture
Keys.route<SearchInput, Message>('Nothing', { on: [], handle: () => Option.none() })

const Search = SlotView.over(SearchSlots)<SearchInput, Message>()

// A route written inline is typed from the binder: nothing is annotated.
const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  routes: [
    Keys.route('EscapeClears', {
      on: [Keys.chord('Escape')],
      handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Cleared)),
    }),
    Keys.route('Focuses', {
      on: [Keys.printable, Keys.where(key => key === 'Dead')],
      handle: ({ input, item }) =>
        Option.some(Keys.focus(`${item?.index ?? 0}`, input.open ? Cleared : Cleared)),
    }),
  ],
})
const SearchField = Search.define((input, slots, h) =>
  h.div(slots.root.attrs(), [h.input(slots.input.attrs([h.Value(input.query)]))]),
).pipe(Behavior.attach(SearchKeys))
const _field: SlotView.SlotView<typeof SearchSlots, SearchInput, Message> = SearchField
void _field

// A route declared over the fields it reads, and a narrower Message, joins a wider router.
const Narrow = Keys.route<{ readonly query: string }, { readonly _tag: 'Cleared' }>('Narrow', {
  on: [Keys.chord('Escape')],
  handle: () => Option.some({ _tag: 'Cleared' }),
})
Keys.behavior(Search)({ slot: 'input', routes: [Keys.first(Narrow, Narrow)] })

// The slots-first call names the two types itself.
Keys.behavior(SearchSlots)<SearchInput, Message>({ slot: 'input', routes: [Narrow] })

Keys.behavior(Search)({
  slot: 'input',
  routes: [
    Keys.route('Reads', {
      on: [Keys.chord('Enter')],
      // @ts-expect-error -- `SearchInput` has no `missing`
      handle: ({ input }) => Option.some(input.missing),
    }),
  ],
})

Keys.behavior(Search)({
  slot: 'input',
  routes: [
    // @ts-expect-error -- `Strayed` is outside the Message universe
    Keys.route<SearchInput, { readonly _tag: 'Strayed' }>('Strays', {
      on: [Keys.chord('Enter')],
      handle: () => Option.some({ _tag: 'Strayed' }),
    }),
  ],
})

// @ts-expect-error -- the contract publishes no slot `nope`
Keys.behavior(Search)({ slot: 'nope', routes: [] })

// @ts-expect-error -- a hidden slot takes no Behavior
Keys.behavior(Search)({ slot: 'internals', routes: [] })
