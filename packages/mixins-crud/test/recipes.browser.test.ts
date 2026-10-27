/**
 * The shipped looks in a real browser. A list row opens wherever it is pressed,
 * as its highlight promises, and its sorting heading is a finger's height. An
 * editor's failure reads in the error's ink, and a delete's yes in the error's
 * fill. A row list's row is a finger's height, its parts side by side, and the
 * way into one it opens reaches across it.
 */
import { Option, Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Query, type Page, type RemoteData } from 'foldkit-remote'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  ConfirmSlots,
  ConfirmView,
  EditorSlots,
  EditorView,
  ListSlots,
  ListView,
  RowListSlots,
  RowListView,
} from '../src/index.js'
import { Confirm, Editor, List, RowList } from '../src/recipes.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.annotate({ title: 'Title' }),
    note: Schema.String.annotate({ title: 'Note' }),
  }),
)
const PostRow = Entity.select(Post, { id: true, title: true, note: true })
type Row = typeof PostRow.schema.Type
const Posts = Crud.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Post) }),
  selection: PostRow,
})
const page: RemoteData<Page<Row>> = {
  _tag: 'Ready',
  value: {
    items: [{ id: 'p1', title: 'First', note: 'a note long enough to fill its cell' }],
    hasNext: false,
    hasPrevious: false,
  },
}

const Model = Schema.Struct({ opened: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Opened: { id: Schema.String }, Sorted: {}, Nothing: {} })
type Message = typeof Message.Type

const Table = ListView.forMessages<Message>()
  .define(Posts)
  .pipe(Style.attach(Style.forSlots(ListSlots)(List({}))))
const Rows = RowListView.forMessages<Message>()
  .define<Row>({ name: 'Rows' })
  .pipe(Style.attach(Style.forSlots(RowListSlots)(RowList({}))))
const EditorStyled = EditorView.forMessages<Message>()
  .define()
  .pipe(Style.attach(Style.forSlots(EditorSlots)(Editor({}))))
const ConfirmStyled = ConfirmView.forMessages<Message>()
  .define()
  .pipe(Style.attach(Style.forSlots(ConfirmSlots)(Confirm({}))))

const mount = async (view: (model: typeof Model.Type, h: HtmlBuilder<Message>) => Html) => {
  // The tokens the recipes read, as an application's sheet declares them.
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
  )
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'styled'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { opened: [] } }),
      update: (model, message) =>
        Message.match(message, {
          Opened: ({ id }) => ({ model: { opened: [...model.opened, id] } }),
          Sorted: () => ({ model }),
          Nothing: () => ({ model }),
        }),
      view,
    }),
  )
}

test('a row opens wherever it is pressed, and its sorting heading is a finger’s height', async () => {
  let opened: ReadonlyArray<string> = []
  await mount((model, h) => {
    opened = model.opened
    return Table(
      {
        page,
        onOpen: row => Message.Opened({ id: row.id }),
        sort: { title: { message: Message.Sorted() } },
      },
      h,
    )
  })
  const note = await vi.waitFor(() => {
    const cell = Array.from(document.querySelectorAll('td')).find(td =>
      td.textContent?.startsWith('a note'),
    )
    expect(cell).toBeDefined()
    return cell!
  })
  // The note's cell holds no button: what is under its middle is the row's way in, stretched over it.
  const box = note.getBoundingClientRect()
  const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  const open = document.querySelector<HTMLElement>('td button')!
  expect(under).toBe(open)
  await userEvent.click(open)
  await vi.waitFor(() => expect(opened).toEqual(['p1']))
  const sort = document.querySelector('th button')!
  expect(sort.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
})

test('an editor’s failure reads in the error’s ink, and a delete’s yes in its fill', async () => {
  await mount((_, h) =>
    h.div(
      [],
      [
        EditorStyled(
          {
            id: 'editor',
            status: 'SaveFailed',
            title: 'Edit post',
            form: h.p([], ['The form']),
            error: 'offline',
          },
          h,
        ),
        // Another editor, saving: its line is the plain one a failure's must differ from.
        EditorStyled(
          { id: 'saving', status: 'Saving', title: 'Edit post', form: h.p([], ['The form']) },
          h,
        ),
        ConfirmStyled(
          {
            id: 'remove',
            status: 'Confirming',
            name: Option.some('p1'),
            onConfirm: Message.Nothing(),
            onCancel: Message.Nothing(),
          },
          h,
        ),
      ],
    ),
  )
  const alert = await vi.waitFor(() => {
    const found = document.querySelector('#editor [role="alert"]')
    expect(found).not.toBeNull()
    return found!
  })
  const plain = getComputedStyle(document.querySelector('#saving [role="status"]')!).color
  expect(getComputedStyle(alert).color).not.toBe(plain)
  const [yes, no] = Array.from(document.querySelectorAll('#remove button'))
  expect(getComputedStyle(yes!).backgroundColor).not.toBe(getComputedStyle(no!).backgroundColor)
})

test('a row list’s rows are a finger’s height, side by side, and open across their width', async () => {
  const row = (item: Row, h: HtmlBuilder<Message>) => [
    h.input([h.Type('checkbox'), h.AriaLabel(`Done: ${item.title}`)]),
    h.span([], [item.title]),
  ]
  await mount((_, h) =>
    h.div(
      [],
      [
        h.div([h.Id('plain')], [Rows({ page, row }, h)]),
        h.div(
          [h.Id('opens')],
          [Rows({ page, row, onOpen: item => Message.Opened({ id: item.id }) }, h)],
        ),
      ],
    ),
  )
  const plain = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('#plain li')
    expect(found).not.toBeNull()
    return found!
  })
  const box = plain.getBoundingClientRect()
  expect(box.height).toBeGreaterThanOrEqual(40)
  // Beside each other, both on the row's middle line.
  const middle = (element: Element) => {
    const rect = element.getBoundingClientRect()
    return rect.top + rect.height / 2
  }
  const check = plain.querySelector('input')!
  const words = plain.querySelector('span')!
  expect(words.getBoundingClientRect().left).toBeGreaterThan(check.getBoundingClientRect().right)
  expect(Math.abs(middle(check) - middle(plain))).toBeLessThanOrEqual(2)
  expect(Math.abs(middle(words) - middle(plain))).toBeLessThanOrEqual(2)
  const opens = document.querySelector('#opens li')!
  const open = opens.querySelector('button')!
  expect(open.getBoundingClientRect().width).toBeGreaterThanOrEqual(
    opens.getBoundingClientRect().width - 1,
  )
  expect(open.getBoundingClientRect().height).toBeGreaterThanOrEqual(40)
})
