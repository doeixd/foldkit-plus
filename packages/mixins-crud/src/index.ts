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
import { Display, type DisplayColumn, type DisplayWords } from 'foldkit-crud'
import { Attr, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import type { Page, RemoteData, RemoteError } from 'foldkit-remote'
import type { Html, HtmlBuilder } from 'foldkit/html'

/** The words of a list or a detail that are not a value's own. */
export interface ViewWords extends DisplayWords {
  /** While the first answer is awaited. Default `Loading…`. */
  readonly loading?: string
  /** When the read failed. Default the error's message. */
  readonly failed?: (error: RemoteError) => string
  /** A list with no rows, or a detail of something that is gone. Default `Nothing here.` */
  readonly empty?: string
  /** On the button that loads the next page. Default `More`. */
  readonly more?: string
}

/** How one column is sorted now, and the Message a click on its header sends. */
export interface ColumnSort<Message> {
  readonly direction?: 'asc' | 'desc' | undefined
  readonly message: Message
}

/** What a list's Style and Behavior attachments may read, and what the application gives it. */
export interface ListInput<Row, Message, Key extends string = string> {
  readonly page: RemoteData<Page<Row>>
  /** Opens a row. Given, the first shown cell of each row is a button that sends it. */
  readonly onOpen?: ((row: Row) => Message) | undefined
  /** Loads the next page. Shown while the page has one. */
  readonly onMore?: Message | undefined
  /** The columns that sort, each with its state and its Message. */
  readonly sort?: { readonly [K in Key]?: ColumnSort<Message> } | undefined
  /** A cell drawn specially: a link, a badge. Every other cell says `Display.show`. */
  readonly cells?: { readonly [K in Key]?: (row: Row, h: HtmlBuilder<Message>) => Html } | undefined
  /** What identifies a row across renders. Default its `id`, else its position. */
  readonly rowKey?: ((row: Row) => string) | undefined
  readonly words?: ViewWords | undefined
}

/** What a detail's attachments may read, and what the application gives it. */
export interface DetailInput<Value, Message, Key extends string = string> {
  readonly value: RemoteData<Value>
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
})

/** A detail: each selected member as a term and its value. */
export const DetailSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Base }),
  term: Slot.make({ capability: Capability.Base }),
  value: Slot.make({ capability: Capability.Base }),
})

const shown = <Key extends string>(
  columns: ReadonlyArray<DisplayColumn<Key>>,
): ReadonlyArray<DisplayColumn<Key>> => columns.filter(column => column.display._tag !== 'Hidden')

const failedWords = (words: ViewWords | undefined, error: RemoteError): string =>
  words?.failed?.(error) ?? error.message

const ariaSort = (direction: 'asc' | 'desc' | undefined): 'ascending' | 'descending' | 'none' =>
  direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'

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
        const status = (text: string, alert = false): Html =>
          h.div(slots.root.attrs([h.Id(listed.name)]), [
            h.p(slots.status.attrs(alert ? [h.Role('alert')] : [h.Role('status')]), [text]),
          ])

        const table = (page: Page<Row>, refreshing: boolean): Html => {
          if (page.items.length === 0) return status(words?.empty ?? 'Nothing here.')
          return h.div(slots.root.attrs([h.Id(listed.name)]), [
            h.table(slots.table.attrs(refreshing ? [h.AriaBusy(true)] : []), [
              h.thead(
                [],
                [
                  h.tr(
                    [],
                    columns.map(column => {
                      const sorting = input.sort?.[column.key]
                      return h.th(
                        slots.headCell.attrs([
                          h.Scope('col'),
                          ...(sorting === undefined
                            ? []
                            : [h.AriaSort(ariaSort(sorting.direction))]),
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
                ],
              ),
              h.tbody(
                [],
                page.items.map((row, position) => {
                  const values = row as Readonly<Record<string, unknown>>
                  const key =
                    input.rowKey?.(row) ??
                    (typeof values.id === 'string' ? values.id : String(position))
                  return h.tr(
                    slots.row.attrs([h.Key(key)]),
                    columns.map((column, index) => {
                      const special = input.cells?.[column.key]
                      const content: Html | string =
                        special === undefined
                          ? Display.show(column.display, values[column.key], words)
                          : special(row, h)
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
        }

        const { page } = input
        switch (page._tag) {
          case 'Initial':
          case 'Loading':
            return status(words?.loading ?? 'Loading…')
          case 'Failed':
            return status(failedWords(words, page.error), true)
          case 'NotFound':
            return status(words?.empty ?? 'Nothing here.')
          case 'Refreshing':
            return table(page.value, true)
          case 'Ready':
            return table(page.value, false)
        }
      },
      { name: listed.name },
    )
  },
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
        const status = (text: string, alert = false): Html =>
          h.div(slots.root.attrs([h.Id(detailed.name)]), [
            h.p(slots.status.attrs(alert ? [h.Role('alert')] : [h.Role('status')]), [text]),
          ])
        const lines = (value: Value, refreshing: boolean): Html =>
          h.dl(
            slots.root.attrs([h.Id(detailed.name), ...(refreshing ? [h.AriaBusy(true)] : [])]),
            fields.flatMap(field => {
              const special = input.cells?.[field.key]
              return [
                h.dt(slots.term.attrs(), [field.label]),
                h.dd(slots.value.attrs(), [
                  special === undefined
                    ? Display.show(
                        field.display,
                        (value as Readonly<Record<string, unknown>>)[field.key],
                        words,
                      )
                    : special(value, h),
                ]),
              ]
            }),
          )

        const read = input.value
        switch (read._tag) {
          case 'Initial':
          case 'Loading':
            return status(words?.loading ?? 'Loading…')
          case 'Failed':
            return status(failedWords(words, read.error), true)
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
