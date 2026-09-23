/**
 * Compile-time contract of `Behaviors.Collection`. Type-checked, not executed.
 */
import { Behaviors, Capability, Slot, Slots } from '../src/index.js'
import type { TestMessage } from './resolverFixture.js'

const { Collection } = Behaviors

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})

interface Tool {
  readonly id: string
}
interface ToolbarInput {
  readonly tools: ReadonlyArray<Tool>
}

const items = Collection.of([{ id: 'a' }] as ReadonlyArray<Tool>, { id: tool => tool.id })
const _tool: Tool | undefined = items.at(0)
void _tool

Collection.behavior(ToolbarSlots)<ToolbarInput, TestMessage>({
  item: 'tool',
  items: input => Collection.of(input.tools, { id: tool => tool.id }),
})

Collection.behavior(ToolbarSlots)<ToolbarInput, TestMessage>({
  // @ts-expect-error the item slot must be one the contract declares.
  item: 'row',
  items: input => Collection.of(input.tools, { id: tool => tool.id }),
})

Collection.of([{ id: 'a' }] as ReadonlyArray<Tool>, {
  // @ts-expect-error an id is a string.
  id: tool => tool.id.length,
})
