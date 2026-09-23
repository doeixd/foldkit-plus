/**
 * ListNavigation: one key handler for arrows, Home, End, PageUp, PageDown and
 * typeahead; the placed transitions (a typed key moves the pointer and
 * extends the query at once); virtual mode; and the reason it exists, pinned:
 * RovingTabindex and Typeahead on one host are refused by the resolver.
 */
import { Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { ListNavigation, RovingTabindex, Typeahead } from '../src/interaction/index.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

interface Fruit {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}
const fruits: ReadonlyArray<Fruit> = [
  { id: 'apple', label: 'Apple' },
  { id: 'apricot', label: 'Apricot', disabled: true },
  { id: 'banana', label: 'Banana' },
  { id: 'blueberry', label: 'Blueberry' },
  { id: 'cherry', label: 'Cherry' },
]
const describeFruits = (items: ReadonlyArray<Fruit>) =>
  Behaviors.Collection.of(items, { id: f => f.id, disabled: f => f.disabled === true })
const items = describeFruits(fruits)
const texts = fruits.map(f => f.label)
const moveOptions: RovingTabindex.MoveOptions = {
  orientation: 'vertical',
  loop: false,
  direction: 'ltr',
  page: 2,
}

describe('ListNavigation.keyOutcome', () => {
  const at = (current: string | null, query = '') => ({ current, query })
  it('navigates on arrows, Home, End, PageUp and PageDown', () => {
    expect(
      ListNavigation.keyOutcome(items, texts, at('apple'), 'ArrowDown', plain, moveOptions),
    ).toEqual({ _tag: 'Navigate', id: 'banana' })
    expect(ListNavigation.keyOutcome(items, texts, at('apple'), 'End', plain, moveOptions)).toEqual(
      { _tag: 'Navigate', id: 'cherry' },
    )
    expect(
      ListNavigation.keyOutcome(items, texts, at('apple'), 'PageDown', plain, moveOptions),
    ).toEqual({ _tag: 'Navigate', id: 'blueberry' })
    expect(
      ListNavigation.keyOutcome(items, texts, at('cherry'), 'PageUp', plain, moveOptions),
    ).toEqual({ _tag: 'Navigate', id: 'banana' })
    expect(
      ListNavigation.keyOutcome(items, texts, at('banana'), 'PageUp', plain, moveOptions),
    ).toEqual({ _tag: 'Navigate', id: 'apple' })
  })
  it('types otherwise, with the match it now picks', () => {
    expect(ListNavigation.keyOutcome(items, texts, at('apple'), 'b', plain, moveOptions)).toEqual({
      _tag: 'Type',
      char: 'b',
      match: 'banana',
    })
    expect(
      ListNavigation.keyOutcome(items, texts, at('banana', 'b'), 'l', plain, moveOptions),
    ).toEqual({ _tag: 'Type', char: 'l', match: 'blueberry' })
    expect(ListNavigation.keyOutcome(items, texts, at('apple'), 'z', plain, moveOptions)).toEqual({
      _tag: 'Type',
      char: 'z',
      match: null,
    })
  })
  it('leaves chords, non-printable keys, and a leading space alone', () => {
    expect(
      ListNavigation.keyOutcome(items, texts, at('apple'), 'Enter', plain, moveOptions),
    ).toBeUndefined()
    expect(
      ListNavigation.keyOutcome(
        items,
        texts,
        at('apple'),
        'b',
        { ...plain, ctrlKey: true },
        moveOptions,
      ),
    ).toBeUndefined()
    expect(
      ListNavigation.keyOutcome(items, texts, at('apple'), ' ', plain, moveOptions),
    ).toBeUndefined()
  })
})

const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Model = Schema.Struct({ ...Nav.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Nav.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args: ListNavigation.Args = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 2,
}
const placed = Page.at(Nav, { args })
const fresh: Model = { nav: { current: null, query: '', generation: 0 } }
const send = (model: Model, message: ListNavigation.Message) =>
  Option.getOrThrow(placed.update(model, Nav.wrapper.make(message)))

describe('ListNavigation placement', () => {
  it('a typed key with a match moves the pointer and extends the query in one transition', () => {
    const typed = send(fresh, ListNavigation.Message.Typed({ char: 'b', match: 'banana' }))
    expect(typed.model.nav).toEqual({ current: 'banana', query: 'b', generation: 1 })
    expect(typed.commands).toHaveLength(1)
    const missed = send(typed.model, ListNavigation.Message.Typed({ char: 'z', match: null }))
    expect(missed.model.nav).toEqual({ current: 'banana', query: 'bz', generation: 2 })
  })
  it('Focused moves the pointer and keeps the query; a stale Expired changes nothing', () => {
    const typed = send(fresh, ListNavigation.Message.Typed({ char: 'b', match: 'banana' })).model
    expect(send(typed, ListNavigation.Message.Focused({ id: 'cherry' })).model.nav).toEqual({
      current: 'cherry',
      query: 'b',
      generation: 1,
    })
    expect(send(typed, ListNavigation.Message.Expired({ generation: 0 })).model.nav.query).toBe('b')
    expect(send(typed, ListNavigation.Message.Expired({ generation: 1 })).model.nav.query).toBe('')
  })
  it('rejects a non-positive page or timeout at placement', () => {
    expect(() => Page.at(Nav, { args: { ...args, page: 0 } })).toThrow(/args do not match/)
    expect(() => Page.at(Nav, { args: { ...args, timeoutMs: 0 } })).toThrow(/args do not match/)
  })
})

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
})
interface ListInput extends Model {
  readonly fruits: ReadonlyArray<Fruit>
}
const h = SlotView.inertBuilder<Message>()
const wire = (options: ListNavigation.Args = args) =>
  ListNavigation.behavior(Nav, options)(ListSlots)<ListInput, Message>({
    container: 'list',
    item: 'option',
    items: input => describeFruits(input.fruits),
    text: (input, index) => input.fruits[index]?.label ?? '',
  })
const builders = (input: ListInput, options: ListNavigation.Args = args) =>
  SlotView.buildersFor(ListSlots, [wire(options).mixin], { input, h })

describe('ListNavigation behavior', () => {
  const input: ListInput = { nav: { current: 'apple', query: '', generation: 0 }, fruits }

  it('one handler focuses by id for navigation and for a typed match', () => {
    const f = Attributes.find(builders(input).list.attrs(), 'OnKeyDownFocus')?.f
    if (f === undefined) throw new Error('no OnKeyDownFocus')
    expect(Option.getOrThrow(f('ArrowDown', plain))).toEqual({
      focusSelector: '[id="banana"]',
      message: Nav.wrapper.make(ListNavigation.Message.Focused({ id: 'banana' })),
    })
    expect(Option.getOrThrow(f('c', plain))).toEqual({
      focusSelector: '[id="cherry"]',
      message: Nav.wrapper.make(ListNavigation.Message.Typed({ char: 'c', match: 'cherry' })),
    })
    expect(Option.getOrThrow(f('z', plain)).focusSelector).toBe('[id="apple"]')
    expect(Option.isNone(f('Enter', plain))).toBe(true)
  })

  it('items get the tab stop and OnFocus as under RovingTabindex', () => {
    const b = builders(input)
    expect(Attributes.find(b.option.attrs([], items.slotItem(0)), 'Tabindex')?.value).toBe(0)
    expect(Attributes.find(b.option.attrs([], items.slotItem(2)), 'Tabindex')?.value).toBe(-1)
    expect(Attributes.find(b.option.attrs([], items.slotItem(2)), 'OnFocus')?.message).toEqual(
      Nav.wrapper.make(ListNavigation.Message.Focused({ id: 'banana' })),
    )
  })

  it('under virtual a typed match moves the pointer without touching DOM focus', () => {
    const b = builders(input, { ...args, virtual: true })
    const root = b.list.attrs()
    expect(Attributes.find(root, 'AriaActiveDescendant')?.value).toBe('apple')
    expect(Attributes.find(root, 'OnKeyDownFocus')).toBeUndefined()
    const f = Attributes.find(root, 'OnKeyDownPreventDefault')?.f
    if (f === undefined) throw new Error('no OnKeyDownPreventDefault')
    expect(Option.getOrThrow(f('b', plain))).toEqual(
      Nav.wrapper.make(ListNavigation.Message.Typed({ char: 'b', match: 'banana' })),
    )
    expect(Attributes.find(b.option.attrs([], items.slotItem(0)), 'Tabindex')).toBeUndefined()
  })
})

describe('why one Bundle', () => {
  it('RovingTabindex and Typeahead on one host are refused: one owner per event', () => {
    const Roving = Bundle.declare(RovingTabindex.bundle, 'focus')
    const Search = Bundle.declare(Typeahead.bundle, 'search')
    const Both = Schema.Struct({ ...Roving.fields, ...Search.fields })
    type Both = typeof Both.Type
    const BothMessage = defineMessageUnion({ ...Roving.cases, ...Search.cases })
    type BothMessage = typeof BothMessage.Type
    interface BothInput extends Both {
      readonly fruits: ReadonlyArray<Fruit>
    }
    const hh = SlotView.inertBuilder<BothMessage>()
    const roving = RovingTabindex.behavior(Roving, {
      orientation: 'vertical',
      loop: false,
      virtual: false,
    })(ListSlots)<BothInput, BothMessage>({
      container: 'list',
      item: 'option',
      items: i => describeFruits(i.fruits),
    })
    const search = Typeahead.behavior(Search)(ListSlots)<BothInput, BothMessage>({
      host: 'list',
      items: i => describeFruits(i.fruits),
      text: (i, index) => i.fruits[index]?.label ?? '',
      current: i => i.focus.current,
    })
    const input: BothInput = {
      focus: { current: null },
      search: { query: '', generation: 0 },
      fruits,
    }
    const b = SlotView.buildersFor(ListSlots, [roving.mixin, search.mixin], { input, h: hh })
    expect(() => b.list.attrs()).toThrow(/two owners for event "keydownfocus"/)
  })
})
