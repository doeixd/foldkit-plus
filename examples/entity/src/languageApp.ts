/**
 * The language page's application: which declared body is chosen, what it is
 * given and who asks. Every reader's answer is derived from that Model
 * (`readout`) by the same functions the `language` command runs
 * (`questions.ts`); only SQLite's answer is a Command, since it runs in the
 * page's WebAssembly and arrives later.
 */
import { Effect, Option, Result, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Expr, Judge, Query, type EntityRef } from 'foldkit-entity'
import {
  evaluated,
  held,
  judged,
  judgedIn,
  pageHolds,
  questions,
  world,
  type Question,
} from './questions.js'

/** The declared bodies' names and the authors' ids; `languageApp.test.ts` holds them to `questions.ts`. */
export const bodyNames = [
  'Search',
  'NotEditedBy',
  'NotEditedByOrUnedited',
  'ByAuthorName',
  'Discussed',
] as const
export const authorIds = ['a1', 'a2', 'a3'] as const
/** Who is asking: nobody, or one of the seeded authors. */
export const viewers = ['visitor', ...authorIds] as const

const Body = Schema.Literals(bodyNames)
const AuthorChoice = Schema.Literals(authorIds)
const Viewer = Schema.Literals(viewers)

const decodeBody = Schema.decodeUnknownOption(Body)
const decodeEditor = Schema.decodeUnknownOption(AuthorChoice)

const StatementSchema = Schema.Struct({ sql: Schema.String, params: Schema.Array(Schema.Unknown) })

/** SQLite's side of the page: asked, answered with the statements Drizzle sent, or failed. */
export const SqlState = defineTaggedUnion({
  Asking: { key: Schema.String },
  Answered: {
    key: Schema.String,
    ids: Schema.Array(Schema.String),
    statements: Schema.Array(StatementSchema),
  },
  Failed: { key: Schema.String, message: Schema.String },
})
export type SqlState = typeof SqlState.Type

const Inputs = Schema.Struct({
  body: Body,
  search: Schema.String,
  name: Schema.String,
  editor: AuthorChoice,
  viewer: Viewer,
})
export type Inputs = typeof Inputs.Type

export const Model = Schema.Struct({ ...Inputs.fields, sql: SqlState })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** From a native select, so the value is text: `update` refuses what is no declared body. */
  ChoseBody: { body: Schema.String },
  TypedSearch: { text: Schema.String },
  TypedName: { text: Schema.String },
  ChoseEditor: { editor: Schema.String },
  ChoseViewer: { viewer: Viewer },
  SqlAnswered: {
    key: Schema.String,
    ids: Schema.Array(Schema.String),
    statements: Schema.Array(StatementSchema),
  },
  SqlFailed: { key: Schema.String, message: Schema.String },
})
export type Message = typeof Message.Type

/** What one run is asked: the Model's inputs, as text. */
const keyOf = (inputs: Inputs): string =>
  JSON.stringify([inputs.body, questionOf(inputs).input, inputs.viewer])

/** The declared body, given what the page holds for its inputs and asked by the chosen viewer. */
export const questionOf = (inputs: Inputs): Question => {
  const base = Option.fromUndefinedOr(questions.find(({ name }) => name === inputs.body)).pipe(
    Option.getOrThrowWith(() => new Error(`no declared body ${inputs.body}`)),
  )
  const typed = new Map<string, string>([
    ['search', inputs.search],
    ['name', inputs.name],
    ['editor', inputs.editor],
  ])
  const input = Object.fromEntries(
    Query.dependencies(base.body).inputs.flatMap(key =>
      Option.match(Option.fromUndefinedOr(typed.get(key)), {
        onNone: () => [],
        onSome: value => [[key, value]],
      }),
    ),
  )
  const viewer: Option.Option<EntityRef> =
    inputs.viewer === 'visitor'
      ? Option.none()
      : Option.some({ entity: 'Author', id: inputs.viewer })
  return { ...base, input, viewer }
}

/** Asks SQLite, in the page, the question the Model holds. Loads the WebAssembly on first use. */
const AskSqlite = Command.define('AskSqlite', {
  args: Inputs.fields,
  messages: [Message.SqlAnswered, Message.SqlFailed],
  execute: inputs =>
    Effect.tryPromise(async () =>
      (await import('./browserSql.js')).askSqlite(questionOf(inputs)),
    ).pipe(
      Effect.map(({ ids, statements }) =>
        Message.SqlAnswered({ key: keyOf(inputs), ids, statements }),
      ),
      Effect.catch(error =>
        Effect.succeed(Message.SqlFailed({ key: keyOf(inputs), message: String(error.cause) })),
      ),
    ),
})

type Next = Update.Return<Model, Message>

export const inputsOf = ({ body, search, name, editor, viewer }: Model): Inputs => ({
  body,
  search,
  name,
  editor,
  viewer,
})

/** The Model with SQLite asked again; anything it answered for another question is dropped. */
const asking = (model: Model): Next => ({
  model: modifyFields(model, { sql: () => SqlState.Asking({ key: keyOf(inputsOf(model)) }) }),
  commands: [AskSqlite(inputsOf(model))],
})

/** The page at start: the first body chosen, and SQLite asked. */
export const initial = (): Next =>
  asking({
    body: 'Search',
    search: 'COMP',
    name: 'ada',
    editor: 'a2',
    viewer: 'a1',
    sql: SqlState.Asking({ key: '' }),
  })

export const update = (model: Model, message: Message): Next =>
  Message.match<Next>(message, {
    ChoseBody: ({ body }) =>
      Option.match(decodeBody(body), {
        onNone: () => ({ model }),
        onSome: chosen =>
          chosen === model.body ? { model } : asking(modifyFields(model, { body: () => chosen })),
      }),
    TypedSearch: ({ text }) =>
      text === model.search ? { model } : asking(modifyFields(model, { search: () => text })),
    TypedName: ({ text }) =>
      text === model.name ? { model } : asking(modifyFields(model, { name: () => text })),
    ChoseEditor: ({ editor }) =>
      Option.match(decodeEditor(editor), {
        onNone: () => ({ model }),
        onSome: chosen =>
          chosen === model.editor
            ? { model }
            : asking(modifyFields(model, { editor: () => chosen })),
      }),
    ChoseViewer: ({ viewer }) =>
      viewer === model.viewer ? { model } : asking(modifyFields(model, { viewer: () => viewer })),
    // An answer to an earlier question is stale: the key names what was asked.
    SqlAnswered: ({ key, ids, statements }) =>
      key === keyOf(inputsOf(model))
        ? { model: modifyFields(model, { sql: () => SqlState.Answered({ key, ids, statements }) }) }
        : { model },
    SqlFailed: ({ key, message }) =>
      key === keyOf(inputsOf(model))
        ? { model: modifyFields(model, { sql: () => SqlState.Failed({ key, message }) }) }
        : { model },
  })

type Post = (typeof world.posts)[number]

/** What `Judge` says of one post held by a page with part of the rows. */
export interface PartVerdict {
  readonly post: Post
  /** In or out where it knows; none where it does not. */
  readonly known: Option.Option<boolean>
  readonly text: string
}

/** Everything the in-memory readers say of the chosen question. */
export interface Readout {
  readonly question: Question
  /** The body as the guide writes it, printed by the package. */
  readonly expression: string
  /** What the body reads of its own row, and of other rows. */
  readonly reads: string
  /** `evaluate` over every post: the ids, or why it refuses. */
  readonly evaluate: Result.Result<ReadonlyArray<string>, string>
  /** `Judge` holding every row, in the body's order. */
  readonly judgeAll: ReadonlyArray<string>
  /** `Judge` holding what `pageHolds` says, post by post. */
  readonly judgePart: ReadonlyArray<PartVerdict>
}

export const readout = (inputs: Inputs): Readout => {
  const question = questionOf(inputs)
  const dependencies = Query.dependencies(question.body)
  const own = dependencies.fields.map(field => field.key).join(', ')
  const others = dependencies.reaches.map(reach => Expr.show(reach)).join(', ')
  return {
    question,
    expression: Query.show(question.body),
    reads: `its own row's ${own}${others === '' ? '' : `, and other rows through ${others}`}`,
    evaluate: evaluated(question, world),
    judgeAll: judgedIn(question, world, held(world)),
    judgePart: judged(question, world, held(world, pageHolds)).map(({ row, verdict }) =>
      Judge.match(verdict, {
        onKnown: truth => ({
          post: row,
          known: Option.some(truth),
          text: truth ? 'in' : 'out',
        }),
        onUnknown: reason => ({ post: row, known: Option.none(), text: `unknown: ${reason}` }),
      }),
    ),
  }
}

/** Whether two answers are the same ids in the same order. */
const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

/** What SQLite's answer is compared with, and how each reader stands against it. */
export interface Agreement {
  /** `evaluate`: agrees or not, or none where it refused to run the body. */
  readonly evaluate: Option.Option<boolean>
  readonly judgeAll: boolean
  /** Of the verdicts a page holding part of the rows is sure of, how many it got wrong. */
  readonly partKnown: number
  readonly partWrong: number
}

export const agreement = (read: Readout, sqlIds: ReadonlyArray<string>): Agreement => {
  const known = read.judgePart.flatMap(({ post, known }) =>
    Option.match(known, { onNone: () => [], onSome: truth => [{ post, truth }] }),
  )
  return {
    evaluate: Result.match(read.evaluate, {
      onFailure: () => Option.none(),
      onSuccess: ids => Option.some(sameIds(ids, sqlIds)),
    }),
    judgeAll: sameIds(read.judgeAll, sqlIds),
    partKnown: known.length,
    partWrong: known.filter(({ post, truth }) => truth !== sqlIds.includes(post.id)).length,
  }
}

const rows = (count: number): string => `${count} ${count === 1 ? 'row' : 'rows'}`

/** The sentence the page's live region says when the choice changes. */
export const summary = (model: Model): string => {
  const read = readout(inputsOf(model))
  const refusal = Result.match(read.evaluate, {
    onFailure: why => ` evaluate refuses: ${why}.`,
    onSuccess: () => '',
  })
  return SqlState.match(model.sql, {
    Asking: () => `${read.question.name}: asking SQLite…`,
    Failed: ({ message }) => `${read.question.name}: SQLite failed: ${message}.`,
    Answered: ({ ids }) => {
      const verdict = agreement(read, ids)
      const memory = Option.match(verdict.evaluate, {
        onNone: () => 'SQLite and Judge',
        onSome: () => 'SQLite, evaluate and Judge',
      })
      const agree =
        verdict.judgeAll && Option.getOrElse(verdict.evaluate, () => true)
          ? `${memory} agree.`
          : 'The readers disagree.'
      return `${read.question.name}: ${rows(ids.length)}. ${agree}${refusal}`
    },
  })
}
