/**
 * RovingTabindex: the pure key-to-index move (orientation, loop, RTL, disabled
 * skipping, Home and End, modifiers), the tab stop when nothing or a stale
 * item is current, the placed transition, and the Behavior's attributes on
 * the container and each item, focus-moving and virtual.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import {
  RovingTabindex,
  RovingTabindexMessage,
  behavior,
  move,
  tabStop,
  type MoveOptions,
  type RovingTabindexArgs,
} from '../src/interaction/index.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const enabled = [0, 1, 3] // item 2 disabled
const vertical: MoveOptions = { orientation: 'vertical', loop: false, direction: 'ltr' }

describe('move', () => {
  it.each<[string, string, number, MoveOptions, number | undefined]>([
    ['ArrowDown steps over a disabled item', 'ArrowDown', 1, vertical, 3],
    ['ArrowUp steps back', 'ArrowUp', 3, vertical, 1],
    ['ArrowDown clamps at the last enabled item', 'ArrowDown', 3, vertical, 3],
    ['ArrowDown wraps when looping', 'ArrowDown', 3, { ...vertical, loop: true }, 0],
    ['ArrowUp wraps when looping', 'ArrowUp', 0, { ...vertical, loop: true }, 3],
    ['Home goes first', 'Home', 3, vertical, 0],
    ['End goes last', 'End', 0, vertical, 3],
    ['ArrowRight is not vertical navigation', 'ArrowRight', 0, vertical, undefined],
    ['ArrowRight steps forward when horizontal', 'ArrowRight', 0, { ...vertical, orientation: 'horizontal' }, 1],
    ['ArrowLeft steps forward under rtl', 'ArrowLeft', 0, { ...vertical, orientation: 'horizontal', direction: 'rtl' }, 1],
    ['ArrowRight steps back under rtl', 'ArrowRight', 1, { ...vertical, orientation: 'horizontal', direction: 'rtl' }, 0],
    ['both accepts either axis', 'ArrowRight', 0, { ...vertical, orientation: 'both' }, 1],
    ['nothing current: ArrowDown lands on the first enabled', 'ArrowDown', -1, vertical, 0],
    ['nothing current: ArrowUp lands on the last enabled', 'ArrowUp', -1, vertical, 3],
    ['a disabled current item: ArrowDown lands on the first enabled', 'ArrowDown', 2, vertical, 0],
    ['an unrelated key is ignored', 'Enter', 0, vertical, undefined],
  ])('%s', (_name, key, current, options, expected) => {
    expect(move(enabled, current, key, plain, options)).toBe(expected)
  })

  it('ignores a key with ctrl, alt or meta held', () => {
    expect(move(enabled, 0, 'ArrowDown', { ...plain, ctrlKey: true }, vertical)).toBeUndefined()
    expect(move(enabled, 0, 'Home', { ...plain, metaKey: true }, vertical)).toBeUndefined()
    expect(move(enabled, 0, 'ArrowDown', { ...plain, shiftKey: true }, vertical)).toBe(1)
  })

  it('does nothing with no enabled items', () => {
    expect(move([], -1, 'ArrowDown', plain, vertical)).toBeUndefined()
  })
})

interface Tool {
  readonly id: string
  readonly disabled?: boolean
}
const tools: ReadonlyArray<Tool> = [{ id: 'cut' }, { id: 'copy', disabled: true }, { id: 'paste' }]
const describeTools = (items: ReadonlyArray<Tool>) =>
  Behaviors.Collection.of(items, { id: t => t.id, disabled: t => t.disabled === true })

describe('tabStop', () => {
  const items = describeTools(tools)
  it('is the current item when it is enabled', () => expect(tabStop(items, 'paste')).toBe(2))
  it('is the first enabled item when nothing is current', () => expect(tabStop(items, null)).toBe(0))
  it('is the first enabled item when the current one is gone or disabled', () => {
    expect(tabStop(items, 'gone')).toBe(0)
    expect(tabStop(items, 'copy')).toBe(0)
  })
  it('is -1 when every item is disabled', () => {
    expect(tabStop(describeTools([{ id: 'a', disabled: true }]), null)).toBe(-1)
  })
})

const Roving = Bundle.declare(RovingTabindex, 'toolbarFocus')
const Model = Schema.Struct({ ...Roving.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Roving.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args: RovingTabindexArgs = { orientation: 'horizontal', loop: true, virtual: false }

describe('RovingTabindex placement', () => {
  const placed = Page.at(Roving, { args })
  it('starts with nothing current and remembers the focused id', () => {
    const start = placed.init({ toolbarFocus: { current: 'stale' } }).model
    expect(start.toolbarFocus.current).toBeNull()
    const next = Option.getOrThrow(
      placed.update(start, Roving.wrapper.make(RovingTabindexMessage.Focused({ id: 'paste' }))),
    ).model
    expect(next.toolbarFocus.current).toBe('paste')
  })
})

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})
interface ToolbarInput extends Model {
  readonly tools: ReadonlyArray<Tool>
  readonly dir?: 'ltr' | 'rtl'
}
const h = SlotView.inertBuilder<Message>()

const wire = (options: RovingTabindexArgs) =>
  behavior(Roving, options)(ToolbarSlots)<ToolbarInput, Message>({
    container: 'root',
    item: 'tool',
    items: input => describeTools(input.tools),
    direction: input => input.dir ?? 'ltr',
  })

const builders = (input: ToolbarInput, options: RovingTabindexArgs = args) =>
  SlotView.buildersFor(ToolbarSlots, [wire(options).mixin], { input, h })

const keyHandler = (input: ToolbarInput, options: RovingTabindexArgs = args) => {
  const attribute = Attributes.find(builders(input, options).root.attrs(), 'OnKeyDownFocus')
  if (attribute === undefined) throw new Error('no OnKeyDownFocus on the container')
  return attribute.f
}

describe('RovingTabindex behavior', () => {
  const input: ToolbarInput = { toolbarFocus: { current: 'paste' }, tools }
  const items = describeTools(tools)

  it('gives the current item the tab stop and the rest -1, each reporting focus', () => {
    const b = builders(input)
    const [cut, copy, paste] = [0, 1, 2].map(i => b.tool.attrs([], items.slotItem(i)))
    expect(Attributes.find(cut!, 'Tabindex')?.value).toBe(-1)
    expect(Attributes.find(copy!, 'Tabindex')?.value).toBe(-1)
    expect(Attributes.find(paste!, 'Tabindex')?.value).toBe(0)
    expect(Attributes.find(cut!, 'OnFocus')?.message).toEqual(
      Roving.wrapper.make(RovingTabindexMessage.Focused({ id: 'cut' })),
    )
  })

  it('gives the first enabled item the tab stop before anything is current', () => {
    const b = builders({ ...input, toolbarFocus: { current: null } })
    expect(Attributes.find(b.tool.attrs([], items.slotItem(0)), 'Tabindex')?.value).toBe(0)
    expect(Attributes.find(b.tool.attrs([], items.slotItem(2)), 'Tabindex')?.value).toBe(-1)
  })

  it('moves focus to the next enabled item by id and dispatches Focused', () => {
    const result = keyHandler({ ...input, toolbarFocus: { current: 'cut' } })('ArrowRight', plain)
    expect(Option.getOrThrow(result)).toEqual({
      focusSelector: '[id="paste"]',
      message: Roving.wrapper.make(RovingTabindexMessage.Focused({ id: 'paste' })),
    })
  })

  it('swaps arrows under rtl', () => {
    const result = keyHandler({ ...input, toolbarFocus: { current: 'cut' }, dir: 'rtl' })(
      'ArrowLeft',
      plain,
    )
    expect(Option.getOrThrow(result).focusSelector).toBe('[id="paste"]')
  })

  it('leaves an unhandled key alone', () => {
    expect(Option.isNone(keyHandler(input)('Enter', plain))).toBe(true)
    expect(Option.isNone(keyHandler(input)('ArrowDown', plain))).toBe(true)
  })

  it('escapes an id in the focus selector', () => {
    const odd: ToolbarInput = {
      toolbarFocus: { current: null },
      tools: [{ id: 'a"b' }, { id: 'c' }],
    }
    expect(Option.getOrThrow(keyHandler(odd)('ArrowRight', plain)).focusSelector).toBe('[id="a\\"b"]')
  })

  it('under virtual keeps focus on the container and points with aria-activedescendant', () => {
    const virtual = { ...args, virtual: true }
    const b = builders(input, virtual)
    expect(Attributes.find(b.root.attrs(), 'AriaActiveDescendant')?.value).toBe('paste')
    expect(Attributes.find(b.tool.attrs([], items.slotItem(2)), 'Tabindex')).toBeUndefined()
    const result = keyHandler({ ...input, toolbarFocus: { current: 'cut' } }, virtual)('ArrowRight', plain)
    // Focus stays where it is (the current stop); only the Message moves the pointer.
    expect(Option.getOrThrow(result)).toEqual({
      focusSelector: '[id="cut"]',
      message: Roving.wrapper.make(RovingTabindexMessage.Focused({ id: 'paste' })),
    })
  })

  it('contributes nothing to an item slot resolved without an item', () => {
    expect(builders(input).tool.attrs()).toEqual([])
  })

  it('renders through a SlotView with Collection supplying the ids', () => {
    const Ids = Behaviors.Collection.behavior(ToolbarSlots)<ToolbarInput, Message>({
      item: 'tool',
      items: i => describeTools(i.tools),
    })
    const Toolbar = SlotView.define(
      ToolbarSlots,
      (i: ToolbarInput, slots, h: HtmlBuilder<Message>) => {
        const described = describeTools(i.tools)
        return h.div(
          slots.root.attrs([h.Role('toolbar')]),
          i.tools.map((tool, index) =>
            h.button(slots.tool.attrs([h.Key(tool.id)], described.slotItem(index)), [tool.id]),
          ),
        )
      },
    ).pipe(SlotView.attach(Ids.mixin), SlotView.attach(wire(args).mixin))
    const vnode = Toolbar(input, h) as {
      readonly children?: ReadonlyArray<{
        readonly data?: { readonly props?: Record<string, unknown>; readonly attrs?: Record<string, unknown> }
      }>
    }
    const children = vnode.children ?? []
    expect(children.map(c => c.data?.props?.['id'])).toEqual(['cut', 'copy', 'paste'])
    // Foldkit reflects `Tabindex` as the `tabIndex` property.
    expect(children.map(c => c.data?.props?.['tabIndex'])).toEqual([-1, -1, 0])
  })
})
