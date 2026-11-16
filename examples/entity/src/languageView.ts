/**
 * The language page: one declared body, printed as the guide writes it, and
 * what each reader answers of it over the same four posts: SQLite (in this
 * page, through the adapter's own compiled statement), `evaluate`, and `Judge`
 * holding everything and holding part. A refusal is shown in the package's
 * own words.
 */
import { Option, Result } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Query } from 'foldkit-entity'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { AppShell, Badge, Card, Input, Segmented, Table } from 'foldkit-mixins-ui'
import {
  Message,
  SqlState,
  agreement,
  authorIds,
  bodyNames,
  inputsOf,
  readout,
  summary,
  viewers,
  type Agreement,
  type Model,
  type PartVerdict,
  type Readout,
} from './languageApp.js'
import {
  CardStyle,
  InputStyle,
  MarkStyle,
  Page,
  ShellStyle,
  TableStyle,
  ViewerStyle,
} from './languageStyle.js'
import { questions, world } from './questions.js'

/** The guide that teaches the language this page makes visible. */
export const GUIDE = 'https://github.com/doeixd/foldkit-plus/blob/main/docs/expressions.md'

type Slots = SlotBuilders<typeof Page.slots, Message>
type Post = (typeof world.posts)[number]

const authorName = (id: string): string =>
  Option.fromUndefinedOr(world.authors.find(author => author.id === id)).pipe(
    Option.match({ onNone: () => id, onSome: author => author.name }),
  )

const postsOf = (ids: ReadonlyArray<string>): ReadonlyArray<Post> =>
  ids.flatMap(id => world.posts.filter(post => post.id === id))

/** The rows an answer holds, as a table, or a line when it holds none. */
const rowsTable = (
  caption: string,
  ids: ReadonlyArray<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  ids.length === 0
    ? h.p(slots.refusal.attrs(), [`${caption}: no rows.`])
    : h.div(slots.frame.attrs(), [
        Table.view(
          {
            caption,
            rowKey: post => post.id,
            rows: postsOf(ids),
            columns: [
              { header: 'Id', rowHeader: true, value: post => post.id },
              { header: 'Title', value: post => post.title },
              { header: 'Author', value: post => authorName(post.author) },
              {
                header: 'Editor',
                value: post =>
                  Option.match(Option.fromNullishOr(post.editor), {
                    onNone: () => 'none',
                    onSome: authorName,
                  }),
              },
            ],
            style: TableStyle,
          },
          h,
        ),
      ])

const mark = (
  tone: 'agree' | 'disagree' | 'refused',
  text: string,
  h: HtmlBuilder<Message>,
): Html => Badge.view({ text, tone, style: MarkStyle }, h)

const reader = (
  title: string,
  description: string,
  action: Option.Option<Html>,
  content: ReadonlyArray<Html>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [h.Key(title)],
    [
      Card.view(
        {
          title,
          description,
          headingLevel: 2,
          ...Option.match(action, { onNone: () => ({}), onSome: action => ({ action }) }),
          content: h.div(slots.reader.attrs(), content),
          style: CardStyle,
        },
        h,
      ),
    ],
  )

const sqliteCard = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  SqlState.match(model.sql, {
    Asking: () =>
      reader(
        'SQLite',
        'asked in this page',
        Option.none(),
        [h.p(slots.note.attrs(), ['Asking…'])],
        slots,
        h,
      ),
    Failed: ({ message }) =>
      reader(
        'SQLite',
        'asked in this page',
        Option.some(mark('refused', 'failed', h)),
        [h.p(slots.refusal.attrs(), [`SQLite did not answer: ${message}`])],
        slots,
        h,
      ),
    Answered: ({ ids, statements }) =>
      reader(
        'SQLite',
        'the adapter’s compiled statement, run by SQLite in this page',
        Option.none(),
        [
          ...statements.flatMap(({ sql, params }) => [
            h.pre(slots.code.attrs([h.AriaLabel('Statement the adapter compiled')]), [
              h.code(slots.statement.attrs(), [sql]),
            ]),
            h.p(slots.note.attrs(), [
              'Parameters: ',
              h.code(slots.mono.attrs(), [JSON.stringify(params)]),
            ]),
          ]),
          rowsTable('Rows SQLite answered', ids, slots, h),
        ],
        slots,
        h,
      ),
  })

const verdictMark = (verdict: Option.Option<boolean>, h: HtmlBuilder<Message>): Html =>
  Option.match(verdict, {
    onNone: () => mark('refused', 'did not run', h),
    onSome: agrees =>
      agrees ? mark('agree', 'agrees with SQLite', h) : mark('disagree', 'differs from SQLite', h),
  })

const evaluateCard = (
  read: Readout,
  versus: Option.Option<Agreement>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reader(
    'evaluate',
    'the reference interpreter over every post',
    Option.map(versus, ({ evaluate }) => verdictMark(evaluate, h)),
    [
      Result.match(read.evaluate, {
        onSuccess: ids => rowsTable('Rows evaluate answered', ids, slots, h),
        onFailure: why =>
          h.p(slots.refusal.attrs(), [`evaluate refuses this body: ${why}. Only SQL answers it.`]),
      }),
    ],
    slots,
    h,
  )

const judgeAllCard = (
  read: Readout,
  versus: Option.Option<Agreement>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reader(
    'Judge, holding everything',
    'a page that holds every row, so it knows',
    Option.map(versus, ({ judgeAll }) => verdictMark(Option.some(judgeAll), h)),
    [rowsTable('Rows Judge knows are in', read.judgeAll, slots, h)],
    slots,
    h,
  )

const partCard = (
  read: Readout,
  versus: Option.Option<Agreement>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reader(
    'Judge, holding part',
    'a page that holds Ada and one comment: it says unknown where it cannot tell',
    Option.map(versus, ({ partKnown, partWrong }) =>
      partWrong === 0
        ? mark('agree', `right on all ${partKnown} it knows`, h)
        : mark('disagree', `wrong on ${partWrong} of ${partKnown}`, h),
    ),
    [
      h.div(slots.frame.attrs(), [
        Table.view(
          {
            caption: 'Judge’s verdict on each post',
            rowKey: (verdict: PartVerdict) => verdict.post.id,
            rows: read.judgePart,
            columns: [
              { header: 'Id', rowHeader: true, value: verdict => verdict.post.id },
              { header: 'Title', value: verdict => verdict.post.title },
              { header: 'Verdict', value: verdict => verdict.text },
            ],
            style: TableStyle,
          },
          h,
        ),
      ]),
    ],
    slots,
    h,
  )

/** A control for each input the chosen body reads; a body that reads none has none. */
const inputControls = (
  model: Model,
  read: Readout,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const text = (
    id: 'search' | 'name',
    label: string,
    value: string,
    send: (text: string) => Message,
  ) =>
    h.div(slots.control.attrs([h.Key(id)]), [
      h.label(slots.label.attrs([h.For(id)]), [label]),
      Input.view(
        {
          id,
          type: 'text',
          value,
          onInput: send,
          style: InputStyle,
          draw: (resolved, h) => h.input(resolved.input),
        },
        h,
      ),
    ])
  const controls = new Map<string, () => Html>([
    [
      'search',
      () =>
        text('search', 'Search text', model.search, value => Message.TypedSearch({ text: value })),
    ],
    [
      'name',
      () => text('name', 'Author name', model.name, value => Message.TypedName({ text: value })),
    ],
    [
      'editor',
      () =>
        h.div(slots.control.attrs([h.Key('editor')]), [
          h.label(slots.label.attrs([h.For('editor')]), ['Editor']),
          h.select(
            slots.select.attrs([
              h.Id('editor'),
              h.Value(model.editor),
              h.OnChange(editor => Message.ChoseEditor({ editor })),
            ]),
            authorIds.map(id =>
              h.option([h.Value(id), h.Selected(id === model.editor)], [authorName(id)]),
            ),
          ),
        ]),
    ],
  ])
  return Query.dependencies(read.question.body).inputs.flatMap(key =>
    Option.match(Option.fromUndefinedOr(controls.get(key)), {
      onNone: () => [],
      onSome: draw => [draw()],
    }),
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  const read = readout(inputsOf(model))
  const versus = SqlState.match(model.sql, {
    Asking: () => Option.none<Agreement>(),
    Failed: () => Option.none<Agreement>(),
    Answered: ({ ids }) => Option.some(agreement(read, ids)),
  })
  return AppShell.view(
    { title: 'Expression language', style: ShellStyle },
    [
      h.div(slots.content.attrs(), [
        h.header(slots.intro.attrs(), [
          h.p(slots.eyebrow.attrs(), ['foldkit-entity']),
          h.h1(slots.heading.attrs(), ['One expression, four answers']),
          h.p(slots.lede.attrs(), [
            'Choose a declared body and see it asked of SQLite (running in this page), of evaluate, and of Judge, over the same four posts. Try ByAuthorName, which evaluate refuses and a Judge holding part of the rows cannot always tell, then Discussed, and switch who is asking. ',
            h.a(slots.link.attrs([h.Href(GUIDE)]), ['Read the Expressions guide']),
            '.',
          ]),
        ]),
        h.section(slots.controls.attrs([h.AriaLabel('Question')]), [
          h.div(slots.control.attrs([h.Key('body')]), [
            h.label(slots.label.attrs([h.For('body')]), ['Body']),
            h.select(
              slots.select.attrs([
                h.Id('body'),
                h.Value(model.body),
                h.OnChange(body => Message.ChoseBody({ body })),
              ]),
              bodyNames.map(name =>
                h.option([h.Value(name), h.Selected(name === model.body)], [name]),
              ),
            ),
            h.p(slots.what.attrs(), [
              Option.fromUndefinedOr(questions.find(({ name }) => name === model.body)).pipe(
                Option.match({ onNone: () => '', onSome: question => question.what }),
              ),
            ]),
          ]),
          ...inputControls(model, read, slots, h),
          h.div(slots.control.attrs([h.Key('viewer')]), [
            Segmented.view(
              {
                id: 'viewer',
                label: 'Asked by',
                options: viewers.map(id => ({
                  value: id,
                  label: id === 'visitor' ? 'A visitor' : authorName(id),
                })),
                pressed: [model.viewer],
                onPress: viewer => Message.ChoseViewer({ viewer }),
                style: ViewerStyle,
              },
              h,
            ),
            h.p(slots.what.attrs(), [
              'Only a body that reads the viewer (Discussed) changes with it.',
            ]),
          ]),
        ]),
        h.p(slots.status.attrs([h.Role('status')]), [summary(model)]),
        reader(
          'The expression',
          'printed by the package, as the guide writes it',
          Option.none(),
          [
            h.pre(slots.code.attrs([h.AriaLabel('The expression')]), [
              h.code([], [read.expression]),
            ]),
            h.p(slots.note.attrs(), [
              `Given ${JSON.stringify(read.question.input)}, asked by ${Option.match(read.question.viewer, { onNone: () => 'a visitor', onSome: ref => `${ref.entity} ${ref.id}` })}. It reads ${read.reads}.`,
            ]),
          ],
          slots,
          h,
        ),
        h.div(slots.readers.attrs(), [
          sqliteCard(model, slots, h),
          evaluateCard(read, versus, slots, h),
          judgeAllCard(read, versus, slots, h),
          partCard(read, versus, slots, h),
        ]),
      ]),
    ],
    h,
  )
}
