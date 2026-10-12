import { Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'

import { Message, TodoList } from './app.js'

const ListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  toggle: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

// The view reads only what the Surface projects, and sends only what it exposes.
export const TodoListView = SurfaceView.define(TodoList, ListSlots, (list, slots, h) =>
  h.ul(
    slots.root.attrs(),
    list.todos.map(todo =>
      h.li(
        [],
        [
          h.button(slots.toggle.attrs([h.OnClick(Message.ToggledTodo({ id: todo.id }))]), [
            todo.title,
          ]),
        ],
      ),
    ),
  ),
).pipe(
  // Its look attaches from outside, to the slots it declared.
  Style.attach(
    Style.forSlots(ListSlots)({ root: Style.class('todos'), toggle: Style.class('todo') }),
  ),
)
