// @vitest-environment jsdom
/**
 * A row's key is on its Slot as `data-row-key`, for the inert drawing and for the markup a
 * server sends, so an application can return focus to the row's button after a re-read
 * with `Dom.focus('[data-row-key="…"] button')`.
 */
import { Effect, Schema } from 'effect'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Query, type Page, type RemoteData } from 'foldkit-remote'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { ListView, RowListView } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String.annotate({ title: 'Title' }) }),
)
const PostRow = Entity.select(Post, { id: true, title: true })
type Row = typeof PostRow.schema.Type
const Posts = Crud.list('Posts', {
  query: Query.make('Posts', { Input: {}, Result: Query.connection(Post) }),
  selection: PostRow,
})

const Message = defineMessageUnion({ Opened: { id: Schema.String } })
type Message = typeof Message.Type

// Keys that are not selector-safe stay what the row says; a caller escapes them.
const rows: ReadonlyArray<Row> = [
  { id: 'a"b', title: 'Quoted' },
  { id: 'plain', title: 'Plain' },
]
const page: RemoteData<Page<Row>> = {
  _tag: 'Ready',
  value: { items: rows, hasNext: false, hasPrevious: false },
}

const Table = ListView.forMessages<Message>().define(Posts)
const Rows = RowListView.forMessages<Message>().define<Row>({ name: 'Rows' })
const onOpen = (row: Row) => Message.Opened({ id: row.id })

const draws = {
  table: (h: HtmlBuilder<Message>, rowKey?: (row: Row) => string) =>
    Table({ page, onOpen, ...(rowKey === undefined ? {} : { rowKey }) }, h),
  list: (h: HtmlBuilder<Message>, rowKey?: (row: Row) => string) =>
    Rows(
      {
        page,
        row: (row, builder) => [builder.span([], [row.title])],
        onOpen,
        ...(rowKey === undefined ? {} : { rowKey }),
      },
      h,
    ),
}

describe.each([
  { name: 'ListView', tag: 'tr', within: 'tbody', draw: draws.table },
  { name: 'RowListView', tag: 'li', within: 'ul', draw: draws.list },
])('$name', ({ tag, within, draw }) => {
  // The header row is no row of the data.
  const keys = (rowKey?: (row: Row) => string) => {
    const body = Inert.byTag(draw(SlotView.inertBuilder<Message>(), rowKey), within)[0]
    return Inert.byTag(body, tag).map(each => Inert.value(each, 'data-row-key'))
  }

  it('carries each row’s key on its row', () => {
    expect(keys()).toEqual(['a"b', 'plain'])
  })

  it('carries the key rowKey gives, the one the row is keyed by', () => {
    expect(keys(row => `post-${row.title}`)).toEqual(['post-Quoted', 'post-Plain'])
  })

  it('is in the markup a server sends, where a caller finds the row’s button by it', async () => {
    const html = await Effect.runPromise(
      renderToString(
        {
          init: () => ({ model: {} }),
          view: (_model: object, h: HtmlBuilder<Message>) => ({
            title: 'Posts',
            body: draw(h),
          }),
        },
        { buildId: 'b' },
      ),
    )
    const served = new DOMParser().parseFromString(
      injectIntoTemplate(
        '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
        html,
      ),
      'text/html',
    )
    const row = served.querySelector(`[data-row-key="${CSS.escape('a"b')}"]`)
    expect(row?.tagName.toLowerCase()).toBe(tag)
    expect(row?.querySelector('button')).not.toBeNull()
    expect(served.querySelectorAll(`${tag}[data-row-key]`)).toHaveLength(2)
  })
})
