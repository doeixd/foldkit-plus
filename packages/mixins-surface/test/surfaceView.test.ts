import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Attributes, Behavior, SlotView, Style, type SlotAttributes } from 'foldkit-mixins'
import { Metadata, Projection, Surface } from 'foldkit-surface'
import { SurfaceView } from '../src/index.js'
import { App, classValue, Message, TodoList, TodoSlots, type TodoMessage } from './fixture.js'

const h = SlotView.inertBuilder<TodoMessage>()

type ProjectedTodo = {
  readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }>
  readonly selectedId: string | null
}

describe('SurfaceView', () => {
  it('names the view after the surface and renders the projected model', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) =>
      h.ul(slots.root.attrs(), [h.li([], [model.selectedId ?? 'none'])]),
    )
    expect(view.name).toBe('TodoList')
    const html = view({ todos: [], selectedId: null }, h)
    expect(html).not.toBeNull()
  })

  it('accepts the core attach pipe', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    )
    const Styled = view.pipe(
      Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })),
    )
    expect(Styled.mixins).toHaveLength(1)
  })

  it('adapts to a Surface renderer', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    )
    const renderer = SurfaceView.toRenderer(view)
    const html = renderer({ todos: [], selectedId: null }, h)
    expect(html).not.toBeNull()
  })

  it('projects the root model through Surface.rootView', () => {
    let seen: unknown
    const view = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) => {
      seen = model
      return h.ul(slots.root.attrs(), [])
    })
    const rootView = Surface.rootView(TodoList, undefined, SurfaceView.toRenderer(view))
    const root = { todos: [{ id: 'a', title: 'A' }], selectedId: 'a', secret: 's' }
    rootView(root, h)
    expect(seen).toEqual({ todos: [{ id: 'a', title: 'A' }], selectedId: 'a' })
  })

  it('renders the projected root model with an inert builder', () => {
    let seen: unknown
    const view = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) => {
      seen = model
      return h.ul(slots.root.attrs(), [])
    })
    const root = { todos: [{ id: 'a', title: 'A' }], selectedId: 'a', secret: 's' }
    const html = SurfaceView.render(view, TodoList, undefined, root)
    expect(seen).toEqual({ todos: [{ id: 'a', title: 'A' }], selectedId: 'a' })
    expect(html).toMatchObject({ sel: 'ul' })
  })

  it('applies Style and a projected-input Behavior through the bridge', () => {
    let resolved: SlotAttributes<TodoMessage> = []
    const ArchiveWhenSelected = Behavior.forSlots(TodoSlots)<ProjectedTodo, TodoMessage>({
      root: Behavior.slot({
        attributes: ({ input, h }) => (input.selectedId === null ? [] : [h.AriaDisabled(true)]),
      }),
    })
    const TodoCard = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) => {
      resolved = slots.root.attrs()
      return h.ul(resolved, [])
    }).pipe(
      Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })),
      Behavior.attach(ArchiveWhenSelected),
    )
    SurfaceView.render(TodoCard, TodoList, undefined, { todos: [], selectedId: 'a', secret: 's' })
    expect(classValue(resolved)).toBe('todo-list')
    expect(Attributes.find(resolved, 'AriaDisabled')?.value).toBe(true)
  })

  it('inspects serializable slot and mixin metadata', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    ).pipe(Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })))
    const info = SurfaceView.inspect(view)
    expect(info.name).toBe('TodoList')
    expect(Object.keys(info.slots)).toEqual(['root', 'archive'])
    expect(info.slots.root?.capability).toBe('Container')
    expect(info.slots.archive?.events).toEqual(['click'])
    expect(info.mixins).toEqual(['Style'])
    expect(JSON.parse(JSON.stringify(info))).toEqual(info)
  })

  it('describes the surface and slots as serializable data', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    ).pipe(Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })))
    const description = SurfaceView.describe(TodoList, undefined, view)
    expect(description.name).toBe('TodoList')
    expect(description.observes).toEqual([['todos'], ['selectedId']])
    expect(description.emits).toEqual(['SelectedTodo', 'ArchivedTodo'])
    expect(Object.keys(description.slots)).toEqual(['root', 'archive'])
    expect(description.mixins).toEqual(['Style'])
    expect(JSON.parse(JSON.stringify(description))).toEqual(description)
  })

  it('describes what other packages attached to the projection', () => {
    const Tags = Metadata.key<string>('tags', { merge: tags => tags, summarize: tag => tag })
    const Tagged = Surface.make(App, 'Tagged', {
      model: ({ model }) =>
        Projection.struct({
          todos: model.todos,
          tagged: Projection.fromReader(Schema.Boolean, () => true, { metadata: Tags.of('beta') }),
        }),
    })
    const view = SurfaceView.define(Tagged, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    )

    expect(SurfaceView.describe(Tagged, undefined, view).metadata).toEqual([
      { name: 'tags', entries: ['beta'] },
    ])
    expect(SurfaceView.describe(TodoList, undefined, view as never).metadata).toEqual([])
  })

  it('renders deterministic markdown', () => {
    const view = SurfaceView.define(TodoList, TodoSlots, (_model, slots, h) =>
      h.ul(slots.root.attrs(), []),
    )
    const render = (): string =>
      SurfaceView.toMarkdown(SurfaceView.describe(TodoList, undefined, view))
    expect(render()).toBe(render())
    const markdown = render()
    expect(markdown).toContain('# TodoList')
    expect(markdown).toContain('- `todos`')
    expect(markdown).toContain('- `SelectedTodo`')
    expect(markdown).toContain('- `archive` — Interactive (events: click)')
  })
})
