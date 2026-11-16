/**
 * One question, three interpreters. A query body is a value: this asks each
 * of five of them of SQLite (compiled by `foldkit-remote-drizzle`), of the
 * reference interpreter over every row (`evaluate`), and of `Judge` twice: as
 * a holder of every row, and as a page that holds some. Where an interpreter
 * answers, the answers are the same; where it cannot, it says so.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Match, Option, Result, Schema } from 'effect'
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
import { databaseLayer, query } from 'foldkit-remote-drizzle'
import { AuthorId, Blog } from './domain.js'
import { Db, ddl } from './server.js'

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

/** SQLite holding `rows`, and what it answers a question with. */
export const openDatabase = (rows: World) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(ddl)
  const author = sqlite.prepare('insert into authors values (?, ?)')
  for (const row of rows.authors) author.run(row.id, row.name)
  const post = sqlite.prepare('insert into posts values (?, ?, ?, ?, ?)')
  for (const row of rows.posts)
    post.run(row.id, row.title, row.published ? 1 : 0, row.author, row.editor)
  const comment = sqlite.prepare('insert into comments values (?, ?, ?, ?, ?)')
  for (const row of rows.comments) comment.run(row.id, row.body, row.post, row.author, '2026-01-01')
  const statements: Array<Statement> = []
  const layer = databaseLayer(
    drizzle({
      client: sqlite,
      logger: { logQuery: (sql, params) => statements.push({ sql, params }) },
    }),
  )
  return {
    /** The ids SQLite answers, in the body's order, and the statement that asked. */
    ask: async (question: Question) => {
      statements.length = 0
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
      return { ids: page.edges.map(edge => edge.id), statements: [...statements] }
    },
    close: () => sqlite.close(),
  }
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
      Match.value(verdict).pipe(
        Match.tagsExhaustive({ Known: ({ truth }) => truth, Unknown: () => false }),
      ),
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

const list = (ids: ReadonlyArray<string>): string => (ids.length === 0 ? 'none' : ids.join(', '))

export const runLanguage = async (): Promise<ReadonlyArray<string>> => {
  const database = openDatabase(world)
  const everything = held(world)
  const page = held(world, pageHolds)
  const lines: string[] = []
  try {
    for (const question of questions) {
      const dependencies = Query.dependencies(question.body)
      const answer = await database.ask(question)
      const reference = evaluated(question, world)
      lines.push(
        `${question.name}: ${question.what}`,
        ...Query.show(question.body)
          .split('\n')
          .map(line => `  ${line}`),
        `  given ${JSON.stringify(question.input)}, asked by ${Option.match(question.viewer, { onNone: () => 'a visitor', onSome: ref => `${ref.entity} ${ref.id}` })}`,
        `  reads its own row's ${dependencies.fields.map(field => field.key).join(', ')}${dependencies.reaches.length === 0 ? '' : `, and other rows through ${dependencies.reaches.map(reach => Expr.show(reach)).join(', ')}`}`,
        ...answer.statements.map(
          statement => `  SQLite ran: ${statement.sql} ${JSON.stringify(statement.params)}`,
        ),
        `  SQLite: ${list(answer.ids)}`,
        `  evaluate, every post: ${Result.match(reference, { onSuccess: list, onFailure: why => `refused, ${why}` })}`,
        `  Judge, every row held: ${list(judgedIn(question, world, everything))}`,
        `  Judge, a page holding Ada and one comment: ${judged(question, world, page)
          .map(
            ({ id, verdict }) =>
              `${id} ${Match.value(verdict).pipe(
                Match.tagsExhaustive({
                  Known: ({ truth }) => (truth ? 'in' : 'out'),
                  Unknown: ({ reason }) => `unknown (${reason})`,
                }),
              )}`,
          )
          .join(', ')}`,
      )
    }
  } finally {
    database.close()
  }
  return lines
}
