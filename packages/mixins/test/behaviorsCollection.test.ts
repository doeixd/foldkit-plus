import { describe, expect, it } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import { Attributes, Behavior, Behaviors, Capability, Slot, Slots, SlotView } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { h, type TestMessage } from './resolverFixture.js'

const { Collection } = Behaviors

interface Tool {
  readonly id: string
  readonly disabled?: boolean
}

const tools: ReadonlyArray<Tool> = [{ id: 'cut' }, { id: 'copy', disabled: true }, { id: 'paste' }]

const describeTools = (items: ReadonlyArray<Tool>) =>
  Collection.of(items, { id: tool => tool.id, disabled: tool => tool.disabled === true })

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})

interface ToolbarInput {
  readonly tools: ReadonlyArray<Tool>
}

const codeOf = (f: () => unknown): string => {
  try {
    f()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic.code
    throw error
  }
  throw new Error('expected to throw')
}

describe('Collection.of', () => {
  it('describes ids, order, and disabled items', () => {
    const items = describeTools(tools)
    expect(items.size).toBe(3)
    expect(items.ids).toEqual(['cut', 'copy', 'paste'])
    expect(items.indexOf('paste')).toBe(2)
    expect(items.indexOf('missing')).toBe(-1)
    expect(items.at(1)).toEqual({ id: 'copy', disabled: true })
    expect(items.at(9)).toBeUndefined()
    expect(items.isDisabled(1)).toBe(true)
    expect(items.isDisabled(0)).toBe(false)
    expect(items.enabled).toEqual([0, 2])
    expect(items.slotItem(2)).toEqual({ index: 2, id: 'paste', count: 3 })
  })

  it('refuses two items with one id, naming both', () => {
    let diagnostic: DiagnosticError | undefined
    try {
      describeTools([{ id: 'a' }, { id: 'b' }, { id: 'a' }])
    } catch (error) {
      diagnostic = error as DiagnosticError
    }
    expect(diagnostic?.diagnostic.code).toBe('mixins:duplicate-item-id')
    expect(diagnostic?.diagnostic.details).toEqual({ id: 'a', indices: [0, 2] })
  })

  it('treats every item as enabled without a disabled predicate', () => {
    const items = Collection.of(tools, { id: tool => tool.id })
    expect(items.enabled).toEqual([0, 1, 2])
  })
})

describe('Collection.behavior', () => {
  const Ids = Collection.behavior(ToolbarSlots)<ToolbarInput, TestMessage>({
    item: 'tool',
    items: input => describeTools(input.tools),
    posInSet: true,
  })

  const resolved = (
    behavior: Behavior.NamedBehavior<typeof ToolbarSlots, ToolbarInput, TestMessage>,
  ) => SlotView.buildersFor(ToolbarSlots, [behavior.mixin], { input: { tools }, h })

  it('writes id, position, and disabled state per item', () => {
    const builders = resolved(Ids)
    const items = describeTools(tools)
    const [first, second, third] = [0, 1, 2].map(index =>
      builders.tool.attrs([], items.slotItem(index)),
    )
    expect(Attributes.find(first!, 'Id')?.value).toBe('cut')
    expect(Attributes.find(first!, 'AriaPosinset')?.value).toBe(1)
    expect(Attributes.find(first!, 'AriaSetsize')?.value).toBe(3)
    expect(Attributes.find(first!, 'AriaDisabled')).toBeUndefined()
    expect(Attributes.find(second!, 'AriaDisabled')?.value).toBe(true)
    expect(Attributes.find(second!, 'AriaPosinset')?.value).toBe(2)
    expect(Attributes.find(third!, 'Id')?.value).toBe('paste')
  })

  it('contributes nothing to a slot resolved without an item', () => {
    expect(resolved(Ids).tool.attrs()).toEqual([])
    expect(resolved(Ids).root.attrs()).toEqual([])
  })

  it('omits position unless asked, and ids when told not to', () => {
    const Bare = Collection.behavior(ToolbarSlots)<ToolbarInput, TestMessage>({
      item: 'tool',
      items: input => describeTools(input.tools),
      ids: false,
    })
    const attributes = resolved(Bare).tool.attrs([], describeTools(tools).slotItem(0))
    expect(attributes).toEqual([])
  })

  it('renders through a SlotView with the item passed from the view', () => {
    const Toolbar = SlotView.define(
      ToolbarSlots,
      (input: ToolbarInput, slots, h: HtmlBuilder<TestMessage>) => {
        const items = describeTools(input.tools)
        return h.div(
          slots.root.attrs(),
          input.tools.map((tool, index) =>
            h.button(slots.tool.attrs([h.Key(tool.id)], items.slotItem(index)), [tool.id]),
          ),
        )
      },
    ).pipe(Behavior.attach(Ids))
    // Foldkit reflects `Id` as a property and ARIA as string attributes.
    const vnode = Toolbar({ tools }, h) as {
      readonly children?: ReadonlyArray<{
        readonly data?: {
          readonly props?: Record<string, unknown>
          readonly attrs?: Record<string, unknown>
        }
      }>
    }
    const children = vnode.children ?? []
    expect(children.map(child => child.data?.props?.['id'])).toEqual(['cut', 'copy', 'paste'])
    expect(children.map(child => child.data?.attrs?.['aria-posinset'])).toEqual(['1', '2', '3'])
    expect(children[1]?.data?.attrs?.['aria-disabled']).toBe('true')
    expect(children[0]?.data?.attrs?.['aria-disabled']).toBeUndefined()
  })

  it('rejects an item slot the contract does not declare', () => {
    expect(
      codeOf(() =>
        Collection.behavior(ToolbarSlots)<ToolbarInput, TestMessage>({
          item: 'row' as never,
          items: input => describeTools(input.tools),
        }),
      ),
    ).toBe('mixins:unknown-slot')
  })
})
