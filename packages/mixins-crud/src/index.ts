/**
 * `foldkit-mixins-crud` — `foldkit-crud` lists and details drawn through slots.
 *
 * `foldkit-crud` describes each column and draws nothing. This package draws a
 * list as an accessible table and a detail as a description list, and publishes
 * every element as a Slot, so an application styles and extends them the way it
 * does any other SlotView. What a click means is the application's: a list holds
 * no state, so the Messages for opening a row, sorting, and loading more arrive
 * as inputs.
 */
import { Display, type DisplayColumn, type DisplayWords, type SortedColumn } from 'foldkit-crud'
import { fillWords } from 'foldkit-form'

type AnyDisplay = DisplayColumn['display']
import { Attr, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import type { Page, RemoteData, RemoteError } from 'foldkit-remote'
import type { Html, HtmlBuilder } from 'foldkit/html'

/** The words of a list or a detail that are not a value's own. */
export interface ViewWords extends DisplayWords {
  /** While the first answer is awaited. Default `Loading…`. */
  readonly loading?: string
  /** When the read failed. `{message}` is the error's. Default `{message}`. */
  readonly failed?: string
  /** A list with no rows, or a detail of something that is gone. Default `Nothing here.` */
  readonly empty?: string
  /** On the button that loads the next page. Default `More`. */
  readonly more?: string
  /** On the button that asks again after a failed read. Default `Try again`. */
  readonly retry?: string
}

/** What a renderer draws one value from. `row` is the list's row, or the detail's whole value. */
export interface DisplayContext<Message> {
  /** The Display, whose `data` is its kind's: narrow it with the kind's `is`. */
  readonly display: AnyDisplay
  readonly value: unknown
  readonly row: unknown
  readonly words: ViewWords
  readonly h: HtmlBuilder<Message>
  /** The Slot a renderer draws a value as a label of its own in, such as a state. */
  readonly badge: SlotView.SlotBuilder<Message>
}

/**
 * Renderers by the `kind` of Display they draw. A kind with none says its text
 * (`Display.show`), so this is how a badge, a link, or a relative date is drawn
 * wherever that kind appears, in any list or detail.
 */
export type DisplayRenderers<Message> = Readonly<
  Record<string, (context: DisplayContext<Message>) => Html>
>

/** What a list's Style and Behavior attachments may read, and what the application gives it. */
export interface ListInput<Row, Message, Key extends string = string> {
  readonly page: RemoteData<Page<Row>>
  /** Opens a row. Given, the first shown cell of each row is a button that sends it. */
  readonly onOpen?: ((row: Row) => Message) | undefined
  /** Loads the next page. Shown while the page has one. */
  readonly onMore?: Message | undefined
  /**
   * Asks again after a failed read, usually a Message whose `update` returns
   * `Data.refresh`. Given, a failed list shows a button that sends it; a failed
   * read is not retried on its own.
   */
  readonly onRetry?: Message | undefined
  /** The columns that sort, each with its state and its Message. */
  readonly sort?: { readonly [K in Key]?: SortedColumn<Message> } | undefined
  /** Renderers by Display kind, for every column of that kind. */
  readonly renderers?: DisplayRenderers<Message> | undefined
  /** One column drawn specially; it wins over a renderer. Every other cell says `Display.show`. */
  readonly cells?: { readonly [K in Key]?: (row: Row, h: HtmlBuilder<Message>) => Html } | undefined
  /** What identifies a row across renders. Default its `id`, else its position. */
  readonly rowKey?: ((row: Row) => string) | undefined
  readonly words?: ViewWords | undefined
}

/** A list drawn as `ul`/`li` rows: the same states as a `ListView`, other markup. */
export const RowListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** Loading, failed, or empty: what is said in place of rows. */
  status: Slot.make({ capability: Capability.Base }),
  /** The `ul` holding the rows, `aria-busy` while refreshing. */
  list: Slot.make({ capability: Capability.Container }),
  /** One `li`, holding a row's drawing. */
  row: Slot.make({ capability: Capability.Container }),
  /** The button around a row's drawing, when the application gave `onOpen`. */
  open: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  more: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Disabled],
  }),
  /** The button that asks again after a failed read. */
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

/** What a `RowListView`'s drawings may read, and what the application gives it. */
export interface RowListInput<Row, Message> {
  readonly page: RemoteData<Page<Row>>
  /** Draws one row's content. The whole row is a button when `onOpen` is given. */
  readonly row: (row: Row, h: HtmlBuilder<Message>) => ReadonlyArray<Html>
  /** Opens a row. Given, the row's drawing becomes a button that sends it. */
  readonly onOpen?: ((row: Row) => Message) | undefined
  /** Loads the next page. Shown while the page has one. */
  readonly onMore?: Message | undefined
  /** Asks again after a failed read. Given, a failed list shows a button that sends it. */
  readonly onRetry?: Message | undefined
  /** What identifies a row across renders. Default its `id`, else its position. */
  readonly rowKey?: ((row: Row) => string) | undefined
  readonly words?: ViewWords | undefined
}

/** What a detail's attachments may read, and what the application gives it. */
export interface DetailInput<Value, Message, Key extends string = string> {
  readonly value: RemoteData<Value>
  /** Asks again after a failed read. Given, a failed detail shows a button that sends it. */
  readonly onRetry?: Message | undefined
  /** Renderers by Display kind, for every field of that kind. */
  readonly renderers?: DisplayRenderers<Message> | undefined
  readonly cells?:
    { readonly [K in Key]?: (value: Value, h: HtmlBuilder<Message>) => Html } | undefined
  readonly words?: ViewWords | undefined
}

/** A list: the table, and what stands in for it while there is none. */
export const ListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** Loading, failed, or empty: what is said in place of rows. */
  status: Slot.make({ capability: Capability.Base }),
  table: Slot.make({ capability: Capability.Container }),
  /** The table's `thead`, its one row, and its `tbody`. */
  head: Slot.make({ capability: Capability.Container }),
  headRow: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  headCell: Slot.make({ capability: Capability.Base }),
  /** The button in the header of a column that sorts. */
  sort: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  row: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Base }),
  /** The button in a row's first cell that opens the row. */
  open: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  more: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Disabled],
  }),
  /** The button that asks again after a failed read. */
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** A value a renderer draws as a label of its own, such as a state. */
  badge: Slot.make({ capability: Capability.Base }),
})

/** A detail: each selected member as a term and its value. */
export const DetailSlots = Slots.define({
  /** The `div` around everything the detail says, in every state. */
  root: Slot.make({ capability: Capability.Container }),
  /** The description list of fields, `aria-busy` while refreshing. */
  list: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Base }),
  term: Slot.make({ capability: Capability.Base }),
  value: Slot.make({ capability: Capability.Base }),
  /** The button that asks again after a failed read. */
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** A value a renderer draws as a label of its own, such as a state. */
  badge: Slot.make({ capability: Capability.Base }),
})

const shown = <Key extends string>(
  columns: ReadonlyArray<DisplayColumn<Key>>,
): ReadonlyArray<DisplayColumn<Key>> => columns.filter(column => column.display.shown)

const failedWords = (words: ViewWords | undefined, error: RemoteError): string =>
  fillWords(words?.failed ?? '{message}', { message: error.message })

const appear = Style.keyframes({ from: { opacity: '0' }, to: { opacity: '1' } })

/**
 * What a read says before it has an answer, wherever rows or a value are not
 * the thing to draw. Each draws one paragraph on the application's own status
 * slot: the words are the caller's, the `role` and `aria-busy` are not
 * negotiable. `ListView` and `DetailView` draw these for their own states.
 */
export const Loading = {
  /** Busy while the first answer is awaited, so loading is told from empty. */
  view: <Message>(
    status: SlotView.SlotBuilder<Message>,
    h: HtmlBuilder<Message>,
    text: string,
  ): Html => h.p(status.attrs([h.Role('status'), h.AriaBusy(true)]), [text]),
  /**
   * Busy text said only once the wait is noticeable: a read that answers
   * quickly shows nothing, where a "Loading…" drawn for a frame read as a
   * flash. Attach it to the status slot. The paragraph itself always renders,
   * so its space is held from the start and nothing moves when the text
   * shows; answering in time removes `aria-busy` before the delay ends, so
   * the text never appears. No spinner art: the text and this delayed fade
   * are the whole convention.
   */
  shown: Style.compose(
    appear.style,
    Style.nest('&[aria-busy="true"]', { animation: `${appear.name} 0.2s 0.6s both` }),
  ),
}

export const Empty = {
  /** Nothing to show, once read: said as a status, never as busy. */
  view: <Message>(
    status: SlotView.SlotBuilder<Message>,
    h: HtmlBuilder<Message>,
    text: string,
  ): Html => h.p(status.attrs([h.Role('status')]), [text]),
}

export const Failure = {
  /** A read that failed: said as an alert, so it interrupts. */
  view: <Message>(
    status: SlotView.SlotBuilder<Message>,
    h: HtmlBuilder<Message>,
    text: string,
  ): Html => h.p(status.attrs([h.Role('alert')]), [text]),
}

const ariaSort = (direction: 'asc' | 'desc' | undefined): 'ascending' | 'descending' | 'none' =>
  direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'

/**
 * The state contract every list view carries, whatever markup draws its rows:
 * busy while the first answer is awaited, empty told from it, a failure as an
 * alert with the caller's retry, and a failed refresh kept above the rows it
 * had. `rows` draws one non-empty page into the root; an empty page is said
 * here, so both lists say it the same way.
 */
const listState = <Row, Message>(
  input: {
    readonly name: string
    readonly page: RemoteData<Page<Row>>
    readonly onRetry?: Message | undefined
    readonly words?: ViewWords | undefined
  },
  slots: {
    readonly root: SlotView.SlotBuilder<Message>
    readonly status: SlotView.SlotBuilder<Message>
    readonly retry: SlotView.SlotBuilder<Message>
  },
  h: HtmlBuilder<Message>,
  rows: (page: Page<Row>, refreshing: boolean, notice: ReadonlyArray<Html>) => Html,
): Html => {
  const { words } = input
  const failure = (error: RemoteError): ReadonlyArray<Html> => [
    Failure.view(slots.status, h, failedWords(words, error)),
    ...(input.onRetry === undefined
      ? []
      : [
          h.button(slots.retry.attrs([h.Type('button'), h.OnClick(input.onRetry)]), [
            words?.retry ?? 'Try again',
          ]),
        ]),
  ]
  const status = (text: string, busy = false): Html =>
    h.div(slots.root.attrs([h.Id(input.name)]), [
      busy ? Loading.view(slots.status, h, text) : Empty.view(slots.status, h, text),
    ])
  const empty = (notice: ReadonlyArray<Html>): Html =>
    notice.length === 0
      ? status(words?.empty ?? 'Nothing here.')
      : h.div(slots.root.attrs([h.Id(input.name)]), [
          ...notice,
          h.p(slots.status.attrs([h.Role('status')]), [words?.empty ?? 'Nothing here.']),
        ])
  const body = (page: Page<Row>, refreshing: boolean, notice: ReadonlyArray<Html> = []): Html =>
    page.items.length === 0 ? empty(notice) : rows(page, refreshing, notice)
  switch (input.page._tag) {
    case 'Initial':
    case 'Loading':
      return status(words?.loading ?? 'Loading…', true)
    case 'Failed':
      // A failed refresh keeps the rows it had: they are still the best answer
      // there is, and the failure is said above them.
      return input.page.previous === undefined
        ? h.div(slots.root.attrs([h.Id(input.name)]), [...failure(input.page.error)])
        : body(input.page.previous, false, failure(input.page.error))
    case 'NotFound':
      return status(words?.empty ?? 'Nothing here.')
    case 'Refreshing':
      return body(input.page.value, true)
    case 'Ready':
      return body(input.page.value, false)
  }
}

const list = <Message>() => ({
  /**
   * The view of a `Crud.list`: a table of its shown columns, in the Selection's
   * order, a `Hidden` column left out. Attach Style and Behavior to the result.
   */
  define: <Key extends string, Row>(listed: {
    readonly name: string
    readonly columns: ReadonlyArray<DisplayColumn<Key>>
    readonly Row: Row
  }): SlotView.SlotView<typeof ListSlots, ListInput<Row, Message, Key>, Message> => {
    const columns = shown(listed.columns)
    return SlotView.forMessages<Message>().define(
      ListSlots,
      (input: ListInput<Row, Message, Key>, slots, h) => {
        const { words } = input
        const draw = (column: DisplayColumn, value: unknown, row: unknown): Html | string =>
          input.renderers?.[column.display.kind]?.({
            display: column.display,
            value,
            row,
            words: words ?? {},
            h,
            badge: slots.badge,
          }) ?? Display.show(column.display, value, words)

        // `notice` goes above the rows: a failure that left them on screen.
        const table = (
          page: Page<Row>,
          refreshing: boolean,
          notice: ReadonlyArray<Html> = [],
        ): Html =>
          h.div(slots.root.attrs([h.Id(listed.name)]), [
            ...notice,
            h.table(slots.table.attrs(refreshing ? [h.AriaBusy(true)] : []), [
              h.thead(slots.head.attrs(), [
                h.tr(
                  slots.headRow.attrs(),
                  columns.map(column => {
                    const sorting = input.sort?.[column.key]
                    return h.th(
                      slots.headCell.attrs([
                        h.Scope('col'),
                        ...(sorting === undefined ? [] : [h.AriaSort(ariaSort(sorting.direction))]),
                      ]),
                      [
                        sorting === undefined
                          ? column.label
                          : h.button(
                              slots.sort.attrs([h.Type('button'), h.OnClick(sorting.message)]),
                              [column.label],
                            ),
                      ],
                    )
                  }),
                ),
              ]),
              h.tbody(
                slots.body.attrs(),
                page.items.map((row, position) => {
                  const values = row as Readonly<Record<string, unknown>>
                  const key =
                    input.rowKey?.(row) ??
                    (typeof values.id === 'string' ? values.id : String(position))
                  return h.tr(
                    slots.row.attrs([h.Key(key)]),
                    columns.map((column, index) => {
                      const special = input.cells?.[column.key]
                      const content = special?.(row, h) ?? draw(column, values[column.key], row)
                      // The way into a row is a button, so a keyboard reaches it.
                      const opens = index === 0 && input.onOpen !== undefined
                      return h.td(slots.cell.attrs(), [
                        opens
                          ? h.button(
                              slots.open.attrs([h.Type('button'), h.OnClick(input.onOpen!(row))]),
                              [content],
                            )
                          : content,
                      ])
                    }),
                  )
                }),
              ),
            ]),
            ...(page.hasNext && input.onMore !== undefined
              ? [
                  h.button(
                    slots.more.attrs([
                      h.Type('button'),
                      h.Disabled(refreshing),
                      h.OnClick(input.onMore),
                    ]),
                    [words?.more ?? 'More'],
                  ),
                ]
              : []),
          ])

        return listState(
          { name: listed.name, page: input.page, onRetry: input.onRetry, words },
          slots,
          h,
          table,
        )
      },
      { name: listed.name },
    )
  },
})

const rowList = <Message>() => ({
  /**
   * The view of a list drawn as `ul`/`li` rows: the same state contract as
   * `ListView`, over the row markup a navigation or a picker needs, where a
   * table's columns would be wrong. The application draws each row's content;
   * the whole row is a button when `onOpen` is given.
   */
  define: <Row>(listed: {
    readonly name: string
  }): SlotView.SlotView<typeof RowListSlots, RowListInput<Row, Message>, Message> =>
    SlotView.forMessages<Message>().define(
      RowListSlots,
      (input: RowListInput<Row, Message>, slots, h) => {
        const { words } = input
        const rows = (
          page: Page<Row>,
          refreshing: boolean,
          notice: ReadonlyArray<Html> = [],
        ): Html =>
          h.div(slots.root.attrs([h.Id(listed.name)]), [
            ...notice,
            h.ul(
              slots.list.attrs(refreshing ? [h.AriaBusy(true)] : []),
              page.items.map((row, position) => {
                const values = row as Readonly<Record<string, unknown>>
                const key =
                  input.rowKey?.(row) ??
                  (typeof values.id === 'string' ? values.id : String(position))
                const content = input.row(row, h)
                return h.li(
                  slots.row.attrs([h.Key(key)]),
                  input.onOpen === undefined
                    ? content
                    : [
                        h.button(
                          slots.open.attrs([h.Type('button'), h.OnClick(input.onOpen(row))]),
                          content,
                        ),
                      ],
                )
              }),
            ),
            ...(page.hasNext && input.onMore !== undefined
              ? [
                  h.button(
                    slots.more.attrs([
                      h.Type('button'),
                      h.Disabled(refreshing),
                      h.OnClick(input.onMore),
                    ]),
                    [words?.more ?? 'More'],
                  ),
                ]
              : []),
          ])
        return listState(
          { name: listed.name, page: input.page, onRetry: input.onRetry, words },
          slots,
          h,
          rows,
        )
      },
      { name: listed.name },
    ),
})

const detail = <Message>() => ({
  /**
   * The view of a `Crud.detail`: a description list of its shown fields, in the
   * Selection's order, a `Hidden` field left out.
   */
  define: <Key extends string, Value>(detailed: {
    readonly name: string
    readonly fields: ReadonlyArray<DisplayColumn<Key>>
    readonly Value: Value
  }): SlotView.SlotView<typeof DetailSlots, DetailInput<Value, Message, Key>, Message> => {
    const fields = shown(detailed.fields)
    return SlotView.forMessages<Message>().define(
      DetailSlots,
      (input: DetailInput<Value, Message, Key>, slots, h) => {
        const { words } = input
        const failure = (error: RemoteError): ReadonlyArray<Html> => [
          Failure.view(slots.status, h, failedWords(words, error)),
          ...(input.onRetry === undefined
            ? []
            : [
                h.button(slots.retry.attrs([h.Type('button'), h.OnClick(input.onRetry)]), [
                  words?.retry ?? 'Try again',
                ]),
              ]),
        ]
        // Busy while the first answer is awaited, so loading is told from empty.
        const status = (text: string, busy = false): Html =>
          h.div(slots.root.attrs([h.Id(detailed.name)]), [
            busy ? Loading.view(slots.status, h, text) : Empty.view(slots.status, h, text),
          ])
        // `notice` goes above the list: a failure that left the value on screen.
        // The root is the same `div` whatever the state, as a list's is, so a
        // style or behaviour on it covers the alert and the button too.
        const lines = (value: Value, refreshing: boolean, notice: ReadonlyArray<Html> = []): Html =>
          h.div(slots.root.attrs([h.Id(detailed.name)]), [
            ...notice,
            h.dl(
              slots.list.attrs(refreshing ? [h.AriaBusy(true)] : []),
              fields.flatMap(field => {
                const special = input.cells?.[field.key]
                return [
                  h.dt(slots.term.attrs(), [field.label]),
                  h.dd(slots.value.attrs(), [
                    special?.(value, h) ??
                      input.renderers?.[field.display.kind]?.({
                        display: field.display,
                        value: (value as Readonly<Record<string, unknown>>)[field.key],
                        row: value,
                        words: words ?? {},
                        h,
                        badge: slots.badge,
                      }) ??
                      Display.show(
                        field.display,
                        (value as Readonly<Record<string, unknown>>)[field.key],
                        words,
                      ),
                  ]),
                ]
              }),
            ),
          ])

        const read = input.value
        switch (read._tag) {
          case 'Initial':
          case 'Loading':
            return status(words?.loading ?? 'Loading…', true)
          case 'Failed':
            // A failed refresh keeps the value it had, with the failure above it.
            return read.previous === undefined
              ? h.div(slots.root.attrs([h.Id(detailed.name)]), [...failure(read.error)])
              : lines(read.previous, false, failure(read.error))
          case 'NotFound':
            return status(words?.empty ?? 'Nothing here.')
          case 'Refreshing':
            return lines(read.value, true)
          case 'Ready':
            return lines(read.value, false)
        }
      },
      { name: detailed.name },
    )
  },
})

export const ListView = {
  /** Names the Messages the view's buttons send: `ListView.forMessages<Message>().define(Posts)`. */
  forMessages: list,
}

export const DetailView = {
  /** Names the Messages a special cell may send: `DetailView.forMessages<Message>().define(PostDetail)`. */
  forMessages: detail,
}

export const RowListView = {
  /**
   * A list drawn as `ul`/`li` rows: `RowListView.forMessages<Message>().define(Pages)`.
   * The row drawing comes from the input; this carries the list's state contract.
   */
  forMessages: rowList,
}
