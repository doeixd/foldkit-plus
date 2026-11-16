/**
 * One question, three interpreters. A query body is a value: this asks each
 * of five of them of SQLite (compiled by `foldkit-remote-drizzle`), of the
 * reference interpreter over every row (`evaluate`), and of `Judge` twice: as
 * a holder of every row, and as a page that holds some. Where an interpreter
 * answers, the answers are the same; where it cannot, it says so. The bodies
 * and the in-memory readers are `questions.ts`; the browser page
 * (`languagePage.ts`) draws the same ones.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Option, Result } from 'effect'
import { Expr, Judge, Query } from 'foldkit-entity'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { ddl } from './tables.js'
import {
  ask,
  evaluated,
  held,
  judged,
  judgedIn,
  pageHolds,
  questions,
  world,
  type Question,
  type Statement,
  type World,
} from './questions.js'

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
      const ids = await ask(question, layer)
      return { ids, statements: [...statements] }
    },
    close: () => sqlite.close(),
  }
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
              `${id} ${Judge.match(verdict, {
                onKnown: truth => (truth ? 'in' : 'out'),
                onUnknown: reason => `unknown (${reason})`,
              })}`,
          )
          .join(', ')}`,
      )
    }
  } finally {
    database.close()
  }
  return lines
}
