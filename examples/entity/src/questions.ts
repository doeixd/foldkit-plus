/**
 * The question set: five declared bodies, the rows they are asked of, and the
 * readers that answer without a database (`evaluate`, `Judge`). Nothing here
 * imports `node:sqlite`, so the trace (`language.ts`) and the browser page
 * (`languagePage.ts`) read the same bodies, rows and readers.
 */
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { Effect, Layer, Option, Result, Schema } from 'effect'
import {
  Expr,
  Held,
  Judge,
  Order,
  Query,
  compareRows,
  evaluate,
  supported,
  type AnyQuery,
  type EntityRef,
  type HeldRows,
  type HeldTable,
  type Row,
} from 'foldkit-entity'
import { Query as RemoteQuery } from 'foldkit-remote'
import { databaseLayer, query, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { AuthorId, Blog } from './domain.js'
import { Db } from './tables.js'

const { Author, Comment, Post } = Blog

/** Every row, as an interpreter over rows reads one: a `one` relation under its key, as the id it points at. */
export interface World {
  readonly authors: ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly posts: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly published: boolean
    readonly author: string
    readonly editor: string | null
  }>
  readonly comments: ReadonlyArray<{
    readonly id: string
    readonly body: string
    readonly post: string
    readonly author: string
  }>
}

export const world: World = {
  authors: [
    { id: 'a1', name: 'Ada' },
    { id: 'a2', name: 'Grace' },
    { id: 'a3', name: 'Joseph' },
  ],
  posts: [
    { id: 'p1', title: 'Notes on the Engine', published: true, author: 'a1', editor: null },
    { id: 'p2', title: 'Compilers', published: false, author: 'a1', editor: 'a2' },
    { id: 'p3', title: 'compost', published: true, author: 'a2', editor: 'a1' },
    { id: 'p4', title: 'Looms', published: true, author: 'a3', editor: null },
  ],
  comments: [
    { id: 'c1', body: 'Remarkable.', post: 'p1', author: 'a2' },
    { id: 'c2', body: 'Thank you.', post: 'p1', author: 'a1' },
    { id: 'c3', body: 'Turn it weekly.', post: 'p3', author: 'a1' },
  ],
}

/** A question: its body, what one run of it is given, and who asks. */
export interface Question {
  readonly name: string
  readonly what: string
  readonly body: AnyQuery
  readonly input: Row
  readonly viewer: Option.Option<EntityRef>
}

const byTitle = Query.orderBy(Order.asc(Post.fields.title))
const search = Expr.input('search', Schema.String)
const editor = Expr.input('editor', AuthorId)
const name = Expr.input('name', Schema.String)
const ada: EntityRef = { entity: 'Author', id: 'a1' }

export const questions: ReadonlyArray<Question> = [
  {
    name: 'Search',
    what: 'posts whose title holds what was typed',
    // `contains` folds ASCII case; the order is the title's declared one, binary.
    body: Query.from(Post).pipe(Query.where(Expr.contains(Post.fields.title, search)), byTitle),
    input: { search: 'COMP' },
    viewer: Option.none(),
  },
  {
    name: 'NotEditedBy',
    what: 'posts not edited by an author',
    // A post with no editor compares as unknown, and `not` keeps it unknown.
    body: Query.from(Post).pipe(
      Query.where(Expr.not(Expr.eq(Post.relations.editor, editor))),
      byTitle,
    ),
    input: { editor: 'a2' },
    viewer: Option.none(),
  },
  {
    name: 'NotEditedByOrUnedited',
    what: 'the same, posts with no editor included',
    body: Query.from(Post).pipe(
      Query.where(
        Expr.or(
          Expr.isNull(Post.relations.editor),
          Expr.not(Expr.eq(Post.relations.editor, editor)),
        ),
      ),
      byTitle,
    ),
    input: { editor: 'a2' },
    viewer: Option.none(),
  },
  {
    name: 'ByAuthorName',
    what: "posts by an author's name",
    // A path: a field of the row `author` points at.
    body: Query.from(Post).pipe(
      Query.where(Expr.contains(Expr.path(Post.relations.author, Author.fields.name), name)),
      byTitle,
    ),
    input: { name: 'ada' },
    viewer: Option.none(),
  },
  {
    name: 'Discussed',
    what: 'posts whoever asks has commented on',
    // An exists: some Comment points here through `post`, and is the viewer's.
    body: Query.from(Post).pipe(
      Query.where(
        Expr.exists(Comment.relations.post, Expr.eq(Comment.relations.author, Expr.viewer(Author))),
      ),
      byTitle,
    ),
    input: {},
    viewer: Option.some(ada),
  },
]

/** A statement SQLite ran, as Drizzle sent it. */
export interface Statement {
  readonly sql: string
  readonly params: ReadonlyArray<unknown>
}

/** The ids the adapter's source answers over `layer`, in the body's order. */
export const ask = async (
  question: Question,
  layer: Layer.Layer<DrizzleDatabase>,
): Promise<ReadonlyArray<string>> => {
  const descriptor = {
    ...RemoteQuery.make(question.name, { Input: {}, Result: RemoteQuery.connection(Post) }),
    body: question.body,
  }
  const page = await Effect.runPromise(
    query(descriptor, { entity: Db.Post })
      .run({
        input: question.input,
        window: { first: 100 },
        principal: null,
        viewer: question.viewer,
      })
      .pipe(Effect.provide(layer)),
  )
  return page.edges.map(edge => edge.id)
}

/**
 * The statements the adapter compiles for a question, as a browser can ask
 * them: the same `query` source runs over Drizzle's proxy driver, which
 * records each statement and answers it with no rows.
 */
export const compiled = async (question: Question): Promise<ReadonlyArray<Statement>> => {
  const statements: Array<Statement> = []
  const record = async (sql: string, params: Array<unknown>) => {
    statements.push({ sql, params })
    return []
  }
  const database = drizzle({ all: record, get: async () => undefined, run: async () => undefined })
  await ask(question, databaseLayer(database))
  return statements
}

const contextOf = (question: Question) => ({ viewer: question.viewer, now: Option.none() })

/** What `evaluate` answers over every post: the ids, or why it will not run the body. */
export const evaluated = (
  question: Question,
  rows: World,
): Result.Result<ReadonlyArray<string>, string> => {
  // `evaluate` reads one table's rows; asked first, it names what it does not run.
  const missing = Query.unsupported(question.body, supported)
  return missing.length > 0
    ? Result.fail(`it does not run ${missing.join(', ')}`)
    : Result.succeed(
        evaluate(question.body, question.input, rows.posts, {
          context: contextOf(question),
        }).map(row => String(row.id)),
      )
}

/** The rows a holder has, as `Judge` reads them. */
export const held = (rows: World, partial?: Pick<World, 'authors' | 'comments'>): HeldRows => {
  const tables: ReadonlyArray<HeldTable> = [
    { entity: Post, rows: rows.posts },
    partial === undefined
      ? { entity: Author, rows: rows.authors }
      : { entity: Author, rows: partial.authors, complete: false },
    partial === undefined
      ? { entity: Comment, rows: rows.comments }
      : { entity: Comment, rows: partial.comments, complete: false },
  ]
  return Held.rows(tables)
}

/** `Judge`'s verdict on each post, by id: in, out, or unknown and why. */
export const judged = (question: Question, rows: World, holder: HeldRows) =>
  rows.posts.flatMap(post =>
    Option.match(holder.row(Post, post.id), {
      onNone: () => [],
      onSome: row => [
        {
          id: post.id,
          row: post,
          verdict: Judge.query(question.body, question.input, row, {
            context: contextOf(question),
            rows: holder,
          }),
        },
      ],
    }),
  )

/** The posts `Judge` knows are in, in the body's order. */
export const judgedIn = (
  question: Question,
  rows: World,
  holder: HeldRows,
): ReadonlyArray<string> =>
  judged(question, rows, holder)
    .filter(({ verdict }) =>
      Judge.match(verdict, { onKnown: truth => truth, onUnknown: () => false }),
    )
    .map(({ row }) => row)
    .sort((left, right) =>
      compareRows(Query.orderFor(question.body, question.input), left, right, question.name, {
        input: question.input,
        context: contextOf(question),
      }),
    )
    .map(row => row.id)

/** What the page in the trace holds: every post, as a list brought them, one author and one comment. */
export const pageHolds = {
  authors: world.authors.filter(author => author.id === 'a1'),
  comments: world.comments.filter(comment => comment.id === 'c2'),
}
