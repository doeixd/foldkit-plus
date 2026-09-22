// @vitest-environment jsdom
/**
 * A list and a detail drawn and driven on the real Foldkit runtime: the table's
 * buttons send the application's own Messages, and the cells say what each
 * column's Display calls for.
 */
import { Schema } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { Entity, Relation } from 'foldkit-entity'
import { SlotView, Style } from 'foldkit-mixins'
import { Query, type Page, type RemoteData } from 'foldkit-remote'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { DetailView, ListSlots, ListView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.annotate({ title: 'Title' }),
    cents: Schema.Number.annotate({ title: 'Price' }),
    live: Schema.Boolean.annotate({ title: 'Live' }),
  }),
)
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const Shown = Blog.Post.pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()),
    cents: Display.of(Display.number(cents => `$${(cents / 100).toFixed(2)}`)),
  }),
)
const PostRow = Entity.select(Shown, {
  id: true,
  title: true,
  cents: true,
  live: true,
  author: Entity.select(Blog.Author, { name: true }),
})
type Row = typeof PostRow.schema.Type

const Posts = Crud.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Shown) }),
  selection: PostRow,
})
const PostDetail = Crud.detail('PostDetail', { selection: PostRow })

const Model = Schema.Struct({
  opened: Schema.NullOr(Schema.String),
  sort: Schema.Literals(['none', 'asc', 'desc']),
  more: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Opened: { id: Schema.String },
  Sorted: {},
  AskedForMore: {},
})
type Message = typeof Message.Type

const rows: ReadonlyArray<Row> = [
  { id: 'p1', title: 'Engines', cents: 1250, live: true, author: { name: 'Ada' } },
  { id: 'p2', title: 'Compilers', cents: 900, live: false, author: { name: 'Grace' } },
]
const ready: RemoteData<Page<Row>> = {
  _tag: 'Ready',
  value: { items: rows, hasNext: true, hasPrevious: false },
}

const Table = ListView.forMessages<Message>()
  .define(Posts)
  .pipe(Style.attach(Style.forSlots(ListSlots)({ table: Style.class('posts-table') })))
const Lines = DetailView.forMessages<Message>().define(PostDetail)

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      Table(
        {
          page: ready,
          onOpen: row => Message.Opened({ id: row.id }),
          onMore: Message.AskedForMore(),
          sort: {
            title: {
              direction: model.sort === 'none' ? undefined : model.sort,
              message: Message.Sorted(),
            },
          },
          words: { yes: 'live', no: 'draft' },
        },
        h,
      ),
      Lines(
        {
          value:
            model.opened === null
              ? { _tag: 'Initial' }
              : { _tag: 'Ready', value: rows.find(row => row.id === model.opened)! },
          words: { loading: 'Pick a post.' },
        },
        h,
      ),
    ],
  )

const texts = (selector: string) =>
  Array.from(document.querySelectorAll(selector), node => node.textContent)

it('draws a list as a table and a detail as a description list, and sends the app’s Messages', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'crud-runtime'
  document.body.appendChild(container)

  let latest: Model = { opened: null, sort: 'none', more: 0 }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: latest }),
      update: (model: Model, message: Message) => {
        latest =
          message._tag === 'Opened'
            ? { ...model, opened: message.id }
            : message._tag === 'Sorted'
              ? { ...model, sort: model.sort === 'asc' ? 'desc' : 'asc' }
              : { ...model, more: model.more + 1 }
        return { model: latest }
      },
      view,
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('#Posts table')).not.toBeNull())
    // A hidden column is read and not shown; labels come from the schema.
    expect(texts('#Posts th')).toEqual(['Title', 'Price', 'Live', 'author'])
    expect(texts('#Posts tbody tr:first-child td')).toEqual(['Engines', '$12.50', 'live', 'Ada'])
    expect(texts('#Posts tbody tr:nth-child(2) td')).toEqual([
      'Compilers',
      '$9.00',
      'draft',
      'Grace',
    ])
    expect(document.querySelector('#Posts table')?.classList.contains('posts-table')).toBe(true)
    expect(texts('#PostDetail')).toEqual(['Pick a post.'])

    // A header that sorts is a button, and says how it is sorted.
    const title = document.querySelector('#Posts th') as HTMLElement
    expect(title.getAttribute('aria-sort')).toBe('none')
    expect(title.getAttribute('scope')).toBe('col')
    title.querySelector('button')!.click()
    await vi.waitFor(() =>
      expect(document.querySelector('#Posts th')?.getAttribute('aria-sort')).toBe('ascending'),
    )
    expect(document.querySelectorAll('#Posts th button')).toHaveLength(1)

    // The way into a row is a button in its first cell.
    const open = document.querySelector('#Posts tbody tr:nth-child(2) td button') as HTMLElement
    expect(open.textContent).toBe('Compilers')
    open.click()
    await vi.waitFor(() =>
      expect(texts('#PostDetail dt')).toEqual(['Title', 'Price', 'Live', 'author']),
    )
    expect(texts('#PostDetail dd')).toEqual(['Compilers', '$9.00', 'no', 'Grace'])

    const more = Array.from(document.querySelectorAll('#Posts button')).at(-1) as HTMLButtonElement
    expect([more.textContent, more.type]).toEqual(['More', 'button'])
    more.click()
    await vi.waitFor(() => expect(latest.more).toBe(1))
  } finally {
    handle.dispose()
  }
})

it('draws every column of a kind through the renderer given for that kind', () => {
  const Plain = ListView.forMessages<Message>().define(Posts)
  const root = Plain(
    {
      page: ready,
      renderers: {
        // A shipped kind, drawn another way; a kind of the application's goes in the same table.
        Flag: ({ value, h }) => h.span([h.Class(value === true ? 'on' : 'off')], ['●']),
      },
      // One column by key wins over its kind.
      cells: { title: (row, h) => h.strong([], [row.title]) },
    },
    SlotView.inertBuilder(),
  ) as unknown as { readonly children: ReadonlyArray<unknown> }
  const found: Array<string> = []
  const walk = (node: unknown): void => {
    const { sel, children } = (node ?? {}) as { sel?: string; children?: ReadonlyArray<unknown> }
    if (sel === 'span' || sel === 'strong') found.push(sel)
    for (const child of children ?? []) walk(child)
  }
  walk(root)
  expect(found).toEqual(['strong', 'span', 'strong', 'span'])
})

it('says what stands in for the rows: loading, failed, and empty', () => {
  // Rendered without a runtime: the states are text, read off the tree.
  const Plain = ListView.forMessages<Message>().define(Posts)
  const read = (page: RemoteData<Page<Row>>, words?: { readonly empty?: string }) => {
    const node = Plain({ page, words }, SlotView.inertBuilder()) as unknown as {
      readonly children: ReadonlyArray<{
        readonly data?: { readonly attrs?: Readonly<Record<string, unknown>> }
        readonly children?: ReadonlyArray<{ readonly text?: string }>
      }>
    }
    const [status] = node.children
    return [status?.data?.attrs?.role, status?.children?.[0]?.text]
  }
  expect(read({ _tag: 'Loading' })).toEqual(['status', 'Loading…'])
  expect(
    read({ _tag: 'Failed', error: { _tag: 'RemoteQueryError', message: 'offline' } as never }),
  ).toEqual(['alert', 'offline'])
  expect(
    read(
      { _tag: 'Ready', value: { items: [], hasNext: false, hasPrevious: false } },
      { empty: 'No posts yet.' },
    ),
  ).toEqual(['status', 'No posts yet.'])
})

/** Every element of a rendered tree, in order: its tag, role and own text. */
const outline = (node: unknown): ReadonlyArray<string> => {
  const found: Array<string> = []
  const walk = (current: unknown): void => {
    const { sel, data, children, text } = (current ?? {}) as {
      sel?: string
      data?: { attrs?: Readonly<Record<string, unknown>> }
      children?: ReadonlyArray<unknown>
      text?: string
    }
    if (sel !== undefined) {
      const role = data?.attrs?.role
      const own = (children ?? [])
        .map(child => (child as { text?: string }).text)
        .filter(value => value !== undefined)
        .join('')
      found.push([sel, role === undefined ? '' : `[${String(role)}]`, own].join(''))
    } else if (text !== undefined) {
      return
    }
    for (const child of children ?? []) walk(child)
  }
  walk(node)
  return found
}

const offline = { _tag: 'RemoteQueryError', message: 'offline' } as never

it('keeps the rows a failed refresh left, and says it failed above them', () => {
  const Plain = ListView.forMessages<Message>().define(Posts)
  const drawn = outline(
    Plain(
      { page: { _tag: 'Failed', error: offline, previous: ready.value } },
      SlotView.inertBuilder(),
    ),
  )

  expect(drawn[1]).toBe('p[alert]offline')
  expect(drawn).toContain('table')
  expect(drawn.filter(element => element === 'tr')).toHaveLength(rows.length + 1)
})

it('offers a retry only when the application gave one', () => {
  const Plain = ListView.forMessages<Message>().define(Posts)
  const failed = { _tag: 'Failed', error: offline } as const

  expect(outline(Plain({ page: failed }, SlotView.inertBuilder()))).not.toContain('buttonTry again')
  expect(
    outline(
      Plain(
        { page: failed, onRetry: Message.AskedForMore(), words: { retry: 'Reload' } },
        SlotView.inertBuilder(),
      ),
    ),
  ).toContain('buttonReload')
  expect(
    outline(
      Plain(
        { page: { ...failed, previous: ready.value }, onRetry: Message.AskedForMore() },
        SlotView.inertBuilder(),
      ),
    ),
  ).toContain('buttonTry again')
})

it('keeps a detail’s value when its refresh failed', () => {
  const Plain = DetailView.forMessages<Message>().define(PostDetail)
  const drawn = outline(
    Plain(
      {
        value: { _tag: 'Failed', error: offline, previous: rows[0]! },
        onRetry: Message.AskedForMore(),
      },
      SlotView.inertBuilder(),
    ),
  )

  expect(drawn.slice(0, 3)).toEqual(['div', 'p[alert]offline', 'buttonTry again'])
  expect(drawn).toContain('dl')
  expect(drawn).toContain(`dd${rows[0]!.title}`)
})
