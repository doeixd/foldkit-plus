/**
 * The shipped looks in a real browser. A list row opens wherever it is pressed,
 * as its highlight promises, and its sorting heading is a finger's height. An
 * editor's failure reads in the error's ink, and a delete's yes in the error's
 * fill.
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
} from '../src/index.js'
import { Confirm, Editor, List } from '../src/recipes.js'

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
