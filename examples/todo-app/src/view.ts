/**
 * The views. Each one renders a Surface from `surface.ts` and publishes the
 * slots from `style.ts`; the styles and behaviors are attached, not written in.
 *
 * Read one view top to bottom and notice what is absent: no class names, no
 * inline style, no keyboard handling. `slots.x.attrs(base)` merges the base
 * attributes the view needs (a value, a Message) with everything attached to
 * that slot, through one resolver that refuses two owners of one event.
 *
 * The two form controls that carry real accessibility work (the checkbox and
 * the buttons) come from `@foldkit/ui`, which builds the attribute bundles and
 * hands them to `toView`; `foldkit-mixins-ui` resolves the attached styles
 * against the component's published contract.
 */
import * as UiButton from '@foldkit/ui/button'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import { Match, Option } from 'effect'
import { todoDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Button as ButtonAdapter, Checkbox as CheckboxAdapter } from 'foldkit-mixins-ui'
import { AddTodoForm } from './agent.js'
import {
  COMPOSER_ID,
  Message,
  bumpPriority,
  counts,
  syncState,
  titleId,
  visibleTodos,
  type Filter,
  type Model,
  type Todo,
} from './app.js'
import {
  AddButtonStyle,
  ClearButtonStyle,
  ComposerSlots,
  ComposerStyle,
  ConnectionSlots,
  ConnectionStyle,
  EditorBehavior,
  FilterBehavior,
  FilterSlots,
  FilterStyle,
  FooterSlots,
  FooterStyle,
  HeaderSlots,
  HeaderStyle,
  ItemSlots,
  ItemStyle,
  PageSlots,
  PageStyle,
  ToggleStyle,
  t,
  type ItemInput,
} from './style.js'
import { Board, Composer, Connection, Footer, Header, writes } from './surface.js'
import { Slots, Slot, Capability } from 'foldkit-mixins'

// --- header: the list title is editable in place --------------------------------

export const HeaderView = SurfaceView.define(Header, HeaderSlots, (model, slots, h) => {
  const tally = counts(model)
  return h.header(slots.root.attrs(), [
    h.input(
      slots.title.attrs([
        h.Type('text'),
        h.Value(model.listTitle),
        h.AriaLabel('List title'),
        // `change` fires on blur or Enter, so a rename is one durable fact, not
        // one per keystroke.
        h.OnChange(title => Message.ListRenameRequested({ title })),
      ]),
    ),
    h.p(slots.tally.attrs(), [`${tally.active} active · ${tally.completed} completed`]),
    h.p(slots.intro.attrs(), [
      'Edits save on this device first and sync when they can, so they survive a reload and work offline. An agent can edit here too.',
    ]),
  ])
}).pipe(Style.attach(HeaderStyle))

// --- connection: where the replica stands against the server ---------------------------

const connectionMixins = [ConnectionStyle.mixin]

export const ConnectionView = SurfaceView.define(Connection, ConnectionSlots, (model, slots, h) => {
  const input = { state: syncState(model) }
  const item = SlotView.buildersFor(ConnectionSlots, connectionMixins, { input, h })
  const changes = `${model.pending} ${model.pending === 1 ? 'change' : 'changes'}`
  const words = Match.value(input.state).pipe(
    Match.when('synced', () => 'Saved on this device and in sync'),
    Match.when('saving', () => `Syncing ${changes}…`),
    Match.when('offline', () =>
      model.pending === 0
        ? 'Offline: edits are kept on this device'
        : `Offline: ${changes} waiting to sync`,
    ),
    Match.when('retrying', () => 'The server did not answer: retrying'),
    Match.exhaustive,
  )
  return h.div(item.root.attrs(), [
    h.p(item.text.attrs([h.Role('status')]), [
      h.span(item.dot.attrs([h.AriaHidden(true)]), []),
      words,
    ]),
    h.button(
      item.toggle.attrs([
        h.Type('button'),
        h.OnClick(Message.OfflineSet({ offline: !model.offline })),
      ]),
      [model.offline ? 'Go online' : 'Go offline'],
    ),
  ])
}).pipe(Style.attach(ConnectionStyle))

// --- composer: the only Surface that may cause `DraftSubmitted` -------------------

export const ComposerView = SurfaceView.define(Composer, ComposerSlots, (model, slots, h) =>
  h.form(slots.root.attrs([...AddTodoForm.form(h), h.OnSubmit(Message.DraftSubmitted())]), [
    h.input(
      slots.input.attrs([
        ...AddTodoForm.field('title', h),
        h.Type('text'),
        h.Placeholder('What needs doing?'),
        h.AriaLabel('New todo'),
        h.Id(COMPOSER_ID),
        h.Value(model.draft),
        h.OnInput(value => Message.DraftChanged({ value })),
      ]),
    ),
    UiButton.view(
      {
        type: 'submit',
        isDisabled: model.draft.trim() === '',
        toView: attributes =>
          h.button(
            ButtonAdapter.resolve(attributes, [AddButtonStyle.mixin], { input: model, h }).button,
            ['Add'],
          ),
      },
      h,
    ),
  ]),
).pipe(Style.attach(ComposerStyle))

// --- board: filters and rows ---------------------------------------------------------

const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  filters: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Collection }),
  empty: Slot.make({ capability: Capability.Container }),
})

const BoardStyle = Style.forSlots(BoardSlots)(
  {
    filters: Style.compose(
      Layers.standard.in('layouts', Layout.cluster({ gap: '0.35rem' })),
      Style.inline({ marginBottom: '0.75rem' }),
    ),
    list: Style.inline({ margin: '0', padding: '0', listStyle: 'none' }),
    empty: Style.inline({
      margin: '0',
      padding: '1.5rem 0',
      textAlign: 'center',
      color: t.text.muted,
    }),
  },
  { name: 'BoardStyle' },
)

const filters: ReadonlyArray<Filter> = ['all', 'active', 'completed']

/** What an empty list says: nothing yet, all done, or nothing under this filter. */
const emptyWords = (model: Pick<Model, 'todos' | 'filter'>): string => {
  if (model.todos.length === 0) return 'No todos yet. Add one above, then try going offline.'
  return Match.value(model.filter).pipe(
    Match.when('active', () => 'All done. Nothing left to do.'),
    Match.when('completed', () => 'Nothing is completed yet.'),
    Match.when('all', () => 'Nothing here.'),
    Match.exhaustive,
  )
}
const filterMixins = [FilterStyle.mixin, FilterBehavior.mixin]
const itemMixins = [ItemStyle.mixin, EditorBehavior.mixin]

export const BoardView = SurfaceView.define(Board, BoardSlots, (model, slots, h) => {
  // Per-item slots: the same contract resolved once per filter and once per
  // row, each with its own input, so `Style.whenInput` sees the item.
  const filterButton = (filter: Filter) => {
    const item = SlotView.buildersFor(FilterSlots, filterMixins, {
      input: { filter, active: model.filter === filter },
      h,
    })
    return h.button(
      item.button.attrs([h.Type('button'), h.OnClick(Message.FilterSelected({ filter }))]),
      [filter],
    )
  }

  const row = (todo: Todo) => {
    const editing = Option.exists(model.editingId, id => id === todo.id)
    const input: ItemInput = { todo, editing, editDraft: model.editDraft }
    const item = SlotView.buildersFor(ItemSlots, itemMixins, { input, h })
    return h.li(item.root.attrs([h.Key(todo.id)]), [
      UiCheckbox.view(
        {
          id: `todo-${todo.id}`,
          isChecked: todo.completed,
          onToggle: () => Message.ToggledTodo({ id: todo.id }),
          toView: attributes => {
            const resolved = CheckboxAdapter.resolve(attributes, [ToggleStyle.mixin], { input, h })
            return h.button(
              [...resolved.checkbox, h.AriaLabel(todo.completed ? 'Mark active' : 'Mark done')],
              [todo.completed ? '✓' : ''],
            )
          },
        },
        h,
      ),
      editing
        ? h.form(
            [h.OnSubmit(Message.EditingSubmitted({}))],
            [
              h.input(
                item.editor.attrs([
                  h.Type('text'),
                  h.Value(model.editDraft),
                  h.OnInput(value => Message.EditDraftChanged({ value })),
                  h.OnBlur(Message.EditingCommitted({})),
                ]),
              ),
            ],
          )
        : h.button(
            item.title.attrs([
              h.Type('button'),
              h.Id(titleId(todo.id)),
              h.Title('Rename'),
              h.AriaLabel(`Rename "${todo.title}"`),
              h.OnClick(Message.EditingStarted({ id: todo.id })),
            ]),
            [todo.title],
          ),
      h.button(
        item.priority.attrs([
          h.Type('button'),
          h.AriaLabel(`Priority ${todo.priority}, click to change`),
          h.OnClick(Message.PrioritySet({ id: todo.id, priority: bumpPriority(todo.priority) })),
        ]),
        [todo.priority],
      ),
      h.button(
        item.remove.attrs([
          h.Type('button'),
          h.AriaLabel(`Delete "${todo.title}"`),
          h.OnClick(Message.DeleteRequested({ id: todo.id })),
        ]),
        ['×'],
      ),
    ])
  }

  const rows = visibleTodos(model)
  return h.section(slots.root.attrs(), [
    h.div(slots.filters.attrs([h.Role('group'), h.AriaLabel('Show')]), filters.map(filterButton)),
    rows.length === 0
      ? h.p(slots.empty.attrs(), [emptyWords(model)])
      : h.ul(slots.list.attrs(), rows.map(row)),
  ])
}).pipe(Style.attach(BoardStyle))

// --- footer --------------------------------------------------------------------------

export const FooterView = SurfaceView.define(Footer, FooterSlots, (model, slots, h) => {
  const tally = counts(model)
  return h.footer(slots.root.attrs(), [
    // A live region: a delete announces itself, and so does its undo.
    h.p(slots.status.attrs([h.Role('status')]), [
      ...Option.match(model.lastError, {
        onSome: error => [error],
        onNone: () =>
          Option.match(model.undo, {
            onSome: todo => [
              `Deleted "${todo.title}".`,
              h.button(slots.undo.attrs([h.Type('button'), h.OnClick(Message.UndoRequested({}))]), [
                'Undo',
              ]),
            ],
            onNone: () => [`${tally.total} ${tally.total === 1 ? 'todo' : 'todos'}`],
          }),
      }),
    ]),
    UiButton.view(
      {
        isDisabled: tally.completed === 0,
        onClick: Message.ClearedCompleted({}),
        toView: attributes =>
          h.button(
            ButtonAdapter.resolve(attributes, [ClearButtonStyle.mixin], { input: model, h }).button,
            ['Clear completed'],
          ),
      },
      h,
    ),
  ])
}).pipe(Style.attach(FooterStyle))

// --- the page: the Root boundary ------------------------------------------------------

/**
 * `writes.rootView` is where the whole Model meets a Surface: it projects the
 * Root and hands the projected Model to the renderer, as `Surface.rootView`
 * does, and keeps the last drawing while no Message since it was made is
 * declared to write a field the Surface reads (`machine.ts`). The renderer's
 * builder is narrowed to the Surface's Messages, so a Board renderer cannot
 * dispatch `DraftSubmitted` even though the page's builder could.
 */
const HeaderRoot = writes.rootView(Header, undefined, SurfaceView.toRenderer(HeaderView))
const ComposerRoot = writes.rootView(Composer, undefined, SurfaceView.toRenderer(ComposerView))
const BoardRoot = writes.rootView(Board, undefined, SurfaceView.toRenderer(BoardView))
const ConnectionRoot = writes.rootView(
  Connection,
  undefined,
  SurfaceView.toRenderer(ConnectionView),
)
const FooterRoot = writes.rootView(Footer, undefined, SurfaceView.toRenderer(FooterView))

const DemoGuide = demoGuide<Message>()

const PageView = SlotView.define(
  PageSlots,
  (
    { model, as }: { readonly model: Model; readonly as: Option.Option<string> },
    slots,
    h: HtmlBuilder<Message>,
  ) =>
    h.main(slots.root.attrs(), [
      HeaderRoot(model, h),
      ConnectionRoot(model, h),
      ComposerRoot(model, h),
      BoardRoot(model, h),
      FooterRoot(model, h),
      // Fixed in the corner, out of the list's way.
      DemoGuide(
        {
          demo: todoDemo,
          more: Option.match(as, { onNone: () => [], onSome: who => [`You are ${who}.`] }),
        },
        h,
      ),
    ]),
).pipe(Style.attach(PageStyle))

/** The page, saying who you are where the page knows (`as`, the token). */
export const viewWith =
  (as: Option.Option<string>) =>
  (model: Model, h: HtmlBuilder<Message>): Document => ({
    title: model.listTitle,
    body: PageView({ model, as }, h),
  })

export const view = viewWith(Option.none())
