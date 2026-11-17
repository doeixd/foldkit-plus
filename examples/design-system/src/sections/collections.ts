/**
 * The Collections section as an island: an empty state, a searchable notification list and a table.
 */
import { Schema } from 'effect'
import { Runtime } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import type { Return } from 'foldkit/update'
import { modifyFields } from 'foldkit/struct'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { Empty, Item, SearchField, Separator, Table } from 'foldkit-mixins-ui'
import {
  EmptyStyle,
  ItemStyle,
  NoticeListStyle,
  PageStyle,
  SearchStyle,
  SeparatorStyle,
  TableStyle,
} from '../style.js'
import { NoticeListSlots, PageSlots } from '../slots.js'
import { neverH } from '../shared.js'

export const Model = Schema.Struct({ query: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  NoticesSearched: { value: Schema.String },
  NoticesCleared: {},
  GotSearchField: { message: SearchField.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({ query: '' })

type PageBuilders = SlotBuilders<typeof PageSlots, Message>

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    NoticesSearched: ({ value }) =>
      value === model.query ? { model } : { model: modifyFields(model, { query: () => value }) },
    // Clearing took focus with the pressed button; the field draws it back.
    NoticesCleared: () => ({
      model: model.query === '' ? model : modifyFields(model, { query: () => '' }),
      commands: Command.mapMessages([SearchField.Focus({ id: 'notice-search' })], message =>
        Message.GotSearchField({ message }),
      ),
    }),
    GotSearchField: () => ({ model }),
  })

const notices: ReadonlyArray<{
  readonly title: string
  readonly when: string
  readonly text: string
}> = [
  { title: 'Deploy finished', when: '2 minutes ago', text: 'Production is live.' },
  { title: 'Review requested', when: '1 hour ago', text: 'The website redesign is ready.' },
  { title: 'Mentioned by Wren', when: 'Yesterday', text: 'Feedback on the onboarding flow.' },
]

export const noticesMatching = (query: string) =>
  notices.filter(notice =>
    `${notice.title} ${notice.text}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

/** A searchable list: the field filters the rows, and the count is announced. */
const NoticesView = (
  model: Pick<Model, 'query'>,
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
): Html => {
  const found = noticesMatching(model.query)
  const list = SlotView.buildersFor(NoticeListSlots, [NoticeListStyle.style.mixin], {
    input: undefined,
    h,
  })
  return h.div(
    [],
    [
      SearchField.view(
        {
          id: 'notice-search',
          label: 'Search notifications',
          value: model.query,
          placeholder: 'Search notifications',
          onInput: value => Message.NoticesSearched({ value }),
          onClear: Message.NoticesCleared(),
          style: SearchStyle,
        },
        h,
      ),
      h.p(slots.live.attrs([h.Role('status')]), [
        `${found.length} of ${notices.length} notifications`,
      ]),
      found.length === 0
        ? Empty.view(
            {
              title: 'No notifications match',
              description: 'Clear the search to see them all.',
              icon: neverH.span([neverH.AriaHidden(true)], ['∅']),
              style: EmptyStyle,
            },
            neverH,
          )
        : h.div(
            list.list.attrs(),
            found.flatMap((notice, index) => [
              ...(index === 0 ? [] : [Separator.view({ style: SeparatorStyle }, neverH)]),
              Item.view(
                {
                  media: neverH.span([neverH.AriaHidden(true)], ['●']),
                  title: notice.title,
                  description: notice.when,
                  content: neverH.span([], [notice.text]),
                  style: ItemStyle,
                },
                neverH,
              ),
            ]),
          ),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'Structured content: an empty state, a notification list you can search, and a table with a row header and a numeric column.',
    ]),
    Empty.view(
      {
        title: 'No projects yet',
        description: 'Create one to get started.',
        icon: neverH.span([neverH.AriaHidden(true)], ['∅']),
        style: EmptyStyle,
      },
      neverH,
    ),
    NoticesView(model, slots, h),
    Table.view(
      {
        caption: 'Team plans',
        columns: [
          { header: 'Plan', rowHeader: true, value: row => row.plan },
          { header: 'Seats', numeric: true, value: row => String(row.seats) },
          { header: 'Price', value: row => row.price },
        ],
        rows: [
          { plan: 'Starter', seats: 5, price: 'Free' },
          { plan: 'Pro', seats: 25, price: '$20' },
          { plan: 'Enterprise', seats: 500, price: 'Custom' },
        ],
        style: TableStyle,
      },
      neverH,
    ),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
