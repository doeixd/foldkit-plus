import { describe, expect, it } from 'vitest'
import { Attributes, Behavior, SlotView } from 'foldkit-mixins'
import { SurfaceView } from '../src/index.js'
import { Message, TodoList, TodoSlots, type TodoMessage } from './fixture.js'

const h = SlotView.inertBuilder<TodoMessage>()
const Todos = SurfaceView.over(TodoList, TodoSlots)

describe('SurfaceView.over', () => {
  it('names a view after the Surface unless told otherwise', () => {
    const draw = Todos.define((model, slots, h) =>
      h.ul(slots.root.attrs(), [model.selectedId ?? 'none']),
    )
    expect(draw.name).toBe('TodoList')
    expect(Todos.define((_, slots, h) => h.ul(slots.root.attrs()), { name: 'Other' }).name).toBe(
      'Other',
    )
  })

  it('makes Behaviors over the projected Model and the exposed Messages', () => {
    const Archives = Todos.behavior({
      archive: {
        attributes: ({ input, h }) => [
          h.OnClick(Message.ArchivedTodo({ id: input.selectedId ?? '' })),
        ],
      },
    })
    const view = Todos.define((_, slots, h) => h.ul(slots.root.attrs())).pipe(
      Behavior.attach(Archives),
    )
    const builders = SlotView.buildersFor(view.slots, view.mixins, {
      input: { todos: [], selectedId: 'a' },
      h,
    })
    expect(Attributes.find(builders.archive.attrs(), 'OnClick')?.message).toEqual(
      Message.ArchivedTodo({ id: 'a' }),
    )
    expect(SlotView.isBound(Todos)).toBe(true)
  })
})
