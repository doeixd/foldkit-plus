// @vitest-environment jsdom
/**
 * A list drawn as `ul`/`li` rows: the state contract a `ListView` carries,
 * over row markup a table would be wrong for. The application draws each row;
 * only `onOpen` makes a row a button, and it sends that row's Message.
 */
import { Schema } from 'effect'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Page, RemoteData } from 'foldkit-remote'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowListSlots, RowListView, type RowListInput } from '../src/index.js'

interface Row {
  readonly id: string
  readonly label: string
}

const Message = defineMessageUnion({
  Opened: { id: Schema.String },
  Retried: {},
  More: {},
})
type Message = typeof Message.Type

const Pages = RowListView.forMessages<Message>().define<Row>({ name: 'Pages' })

const rows: ReadonlyArray<Row> = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
]
const ready: RemoteData<Page<Row>> = {
  _tag: 'Ready',
  value: { items: rows, hasNext: true, hasPrevious: false },
}
const offline = { _tag: 'RemoteQueryError', message: 'offline' } as never

const input = (
  page: RemoteData<Page<Row>>,
  extra: Partial<RowListInput<Row, Message>> = {},
): RowListInput<Row, Message> => ({
  page,
  row: (row, h) => [h.span([], [row.label])],
  onMore: Message.More(),
  ...extra,
})

const draw = (page: RemoteData<Page<Row>>, extra: Partial<RowListInput<Row, Message>> = {}) =>
  Pages(input(page, extra), SlotView.inertBuilder())

const buttonTexts = (node: ReturnType<typeof draw>) =>
  Inert.byTag(node, 'button').map(each => Inert.text(each))

describe('RowListView', () => {
  it('draws one `li` per item in a `ul`, its content the application’s', () => {
    const root = draw(ready)
    expect(Inert.byTag(root, 'ul')).toHaveLength(1)
    expect(Inert.byTag(root, 'li')).toHaveLength(2)
    expect(Inert.byTag(root, 'li').map(each => Inert.text(each))).toEqual(['Home', 'About'])
  })

  it('makes each row a button only when onOpen is given', () => {
    expect(buttonTexts(draw(ready))).toEqual(['More'])
    expect(buttonTexts(draw(ready, { onOpen: row => Message.Opened({ id: row.id }) }))).toEqual([
      'Home',
      'About',
      'More',
    ])
  })

  it('says the states a list has: busy, empty, failed with a retry, refreshing', () => {
    const read = (page: RemoteData<Page<Row>>, extra: Partial<RowListInput<Row, Message>> = {}) => {
      const [status] = Inert.children(draw(page, extra))
      return [
        Inert.value(status, 'role'),
        Inert.value(status, 'aria-busy') ?? 'not busy',
        Inert.children(status)[0]?.text,
      ]
    }
    expect(read({ _tag: 'Loading' })).toEqual(['status', 'true', 'Loading…'])
    expect(read({ _tag: 'NotFound' })).toEqual(['status', 'not busy', 'Nothing here.'])
    expect(read({ _tag: 'Failed', error: offline })).toEqual(['alert', 'not busy', 'offline'])
    expect(
      buttonTexts(
        draw({ _tag: 'Failed', error: offline }, { onRetry: Message.Retried(), onMore: undefined }),
      ),
    ).toEqual(['Try again'])
  })

  it('keeps the rows a failed refresh left, and marks the `ul` busy while refreshing', () => {
    const failed = draw({ _tag: 'Failed', error: offline, previous: ready.value })
    expect(Inert.value(Inert.children(failed)[0], 'role')).toBe('alert')
    expect(Inert.byTag(failed, 'li')).toHaveLength(2)
    const refreshing = Inert.byTag(draw({ _tag: 'Refreshing', value: ready.value }), 'ul')[0]
    expect(Inert.value(refreshing, 'aria-busy')).toBe('true')
  })

  it('draws its own markup through Slots, with no fixed inline style', () => {
    const Styled = RowListView.forMessages<Message>()
      .define<Row>({ name: 'Pages' })
      .pipe(Style.attach(Style.forSlots(RowListSlots)({ list: Style.class('pages') })))
    const root = Inert.draw(Styled, input(ready, { row: () => [] }))
    // The row drawing is the application's; the list's own elements are its Slots.
    expect(Inert.unslotted(root)).toEqual([])
    expect(Inert.fixedInline(root)).toEqual([])
    expect(Inert.classes(Inert.byTag(root, 'ul')[0]!)).toContain('pages')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('sends the row’s Message when a row is opened, and the More Message after', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'row-list'
  document.body.appendChild(container)

  const Model = Schema.Struct({ opened: Schema.NullOr(Schema.String), more: Schema.Number })
  let latest: { readonly opened: string | null; readonly more: number } = { opened: null, more: 0 }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: latest }),
      update: (_: typeof Model.Type, message: Message) => {
        latest =
          message._tag === 'Opened'
            ? { ...latest, opened: message.id }
            : { ...latest, more: latest.more + 1 }
        return { model: latest }
      },
      view: (_: typeof Model.Type, h: HtmlBuilder<Message>) =>
        Pages(
          {
            page: ready,
            row: (row, draw) => [draw.span([], [row.label])],
            onOpen: row => Message.Opened({ id: row.id }),
            onMore: Message.More(),
          },
          h,
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('#Pages li')).toHaveLength(2))
    const [home] = Array.from(document.querySelectorAll('#Pages li button'))
    ;(home as HTMLButtonElement).click()
    await vi.waitFor(() => expect(latest.opened).toBe('home'))
    const more = Array.from(document.querySelectorAll('#Pages button')).at(-1) as HTMLButtonElement
    expect(more.textContent).toBe('More')
    more.click()
    await vi.waitFor(() => expect(latest.more).toBe(1))
  } finally {
    handle.dispose()
  }
})
