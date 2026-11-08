/**
 * Each page a query source reads, as the database plans it (#437). The
 * check asks the database rather than modelling it: whether an index serves
 * an order turns on what the dialect knows of nullability, collation and
 * direction (SQLite sorted every tie-break that placed nulls, whatever the
 * index), which a model of each planner would get wrong.
 */
import { sql, type SQLWrapper } from 'drizzle-orm'
import { Effect, Match, Option } from 'effect'
import type { AnyQuery } from 'foldkit-entity'
import type { QuerySource, RemoteServerError } from 'foldkit-remote-server'
import { DrizzleDatabase } from './database.js'
import { isPostgresTable } from './dialect.js'
import { declarations, ObservedStatements } from './observed.js'

/**
 * How the database orders one page: `served` reads it in order from an index
 * and stops at the page's end; `sorted` reads every matching row and sorts
 * them first (`TEMP B-TREE`, a `Sort` or `Incremental Sort` node). How rows
 * are found otherwise is in the plan's own lines.
 */
export type PlanVerdict = 'served' | 'sorted'

export interface QueryPlan {
  readonly query: string
  readonly input: Readonly<Record<string, unknown>>
  /** The first page, or one after a cursor, whose keyset predicate the first has not. */
  readonly page: 'first' | 'later'
  readonly statement: string
  /** The database's own words: `EXPLAIN QUERY PLAN`'s details, or `EXPLAIN`'s lines. */
  readonly plan: ReadonlyArray<string>
  readonly verdict: PlanVerdict
}

interface Explainable extends SQLWrapper {
  toSQL(): { readonly sql: string }
}

const isExplainable = (statement: unknown): statement is Explainable =>
  typeof statement === 'object' &&
  statement !== null &&
  'toSQL' in statement &&
  'getSQL' in statement

/** The inputs that ask each order a body offers its reader: one per choice and direction, and none chosen. */
const ordersAsked = (
  body: Option.Option<AnyQuery>,
  input: Readonly<Record<string, unknown>>,
): ReadonlyArray<Readonly<Record<string, unknown>>> =>
  Option.match(body, {
    onNone: () => [input],
    onSome: query =>
      query.orderBy.reduce<ReadonlyArray<Readonly<Record<string, unknown>>>>(
        (inputs, ordering) =>
          Match.value(ordering).pipe(
            Match.tagsExhaustive({
              Term: () => inputs,
              Chosen: chosen =>
                inputs.flatMap(asked => [
                  { ...asked, [chosen.sort.key]: null },
                  ...Object.keys(chosen.choices).flatMap(by =>
                    (['asc', 'desc'] as const).map(direction => ({
                      ...asked,
                      [chosen.sort.key]: { by, direction },
                    })),
                  ),
                ]),
            }),
          ),
        [input],
      ),
  })

const sorts = (plan: ReadonlyArray<string>, postgres: boolean): boolean =>
  postgres
    ? plan.some(line => /\bSort\b/.test(line))
    : plan.some(step => step.includes('TEMP B-TREE'))

/** The database's plan for `statement`: Postgres is asked without sequential scans, which it prefers on a small table. */
const explain = (statement: Explainable, postgres: boolean) =>
  Effect.gen(function* () {
    const database = (yield* DrizzleDatabase) as unknown as {
      all(query: SQLWrapper): Promise<ReadonlyArray<Record<string, unknown>>>
      transaction<A>(
        run: (tx: { execute(query: SQLWrapper): Promise<unknown> }) => Promise<A>,
      ): Promise<A>
    }
    // A synchronous driver (node:sqlite) answers at once; `async` takes either.
    const rows = yield* Effect.promise(async () =>
      postgres
        ? database.transaction(async tx => {
            await tx.execute(sql`set local enable_seqscan = off`)
            const result = (await tx.execute(sql`explain ${statement.getSQL()}`)) as
              | { readonly rows: ReadonlyArray<Record<string, unknown>> }
              | ReadonlyArray<Record<string, unknown>>
            return 'rows' in result ? result.rows : result
          })
        : database.all(sql`explain query plan ${statement.getSQL()}`),
    )
    return rows.map(row => String(postgres ? row['QUERY PLAN'] : row.detail).trim())
  })

/**
 * Each page the sources read for these inputs, a first and a later one, as
 * the database plans it, for every order a body offers its reader. Run it in
 * a test over a database migrated as production is: a page that is
 * `sorted` reads every matching row on every request.
 *
 * ```ts
 * const plans = yield* queryPlans([
 *   { source: PostsByOwnerSource, input: { owner: 'u1' }, principal: null },
 * ])
 * expect(plans.filter(plan => plan.verdict !== 'served')).toEqual([])
 * ```
 *
 * The rows in the database decide whether there is a later page to plan, and
 * on SQLite which index the planner picks: seed a few. Only sources made by
 * `query` are planned.
 */
export const queryPlans = <P>(
  cases: ReadonlyArray<{
    readonly source: QuerySource<P, DrizzleDatabase>
    readonly input: Readonly<Record<string, unknown>>
    /** Whom the page is read for, as the server would resolve them. */
    readonly principal: P
  }>,
): Effect.Effect<ReadonlyArray<QueryPlan>, RemoteServerError, DrizzleDatabase> =>
  Effect.forEach(cases, ({ source, input, principal }) => {
    const declared = declarations.get(source)
    if (declared === undefined) {
      return Effect.die(
        new Error(`queryPlans: the source of "${source.query}" was not made by query()`),
      )
    }
    const postgres = isPostgresTable(declared.binding.table)
    const page = (asked: Readonly<Record<string, unknown>>, after: Option.Option<string>) => {
      const built: Array<Explainable> = []
      return source
        .run({
          input: asked,
          window: Option.match(after, {
            onNone: () => ({ first: 2 }),
            onSome: cursor => ({ first: 2, after: cursor }),
          }),
          principal,
        })
        .pipe(
          Effect.provideService(
            ObservedStatements,
            Option.some(statement => {
              if (isExplainable(statement)) built.push(statement)
            }),
          ),
          Effect.map(result => ({ result, statement: built.at(-1) })),
        )
    }
    const planned = (
      asked: Readonly<Record<string, unknown>>,
      which: QueryPlan['page'],
      statement: Explainable | undefined,
    ) =>
      statement === undefined
        ? Effect.die(new Error(`queryPlans: "${declared.name}" ran no statement`))
        : Effect.map(explain(statement, postgres), (plan): QueryPlan => ({
            query: declared.name,
            input: asked,
            page: which,
            statement: statement.toSQL().sql,
            plan,
            verdict: sorts(plan, postgres) ? 'sorted' : 'served',
          }))
    return Effect.forEach(ordersAsked(declared.body, input), asked =>
      Effect.gen(function* () {
        const first = yield* page(asked, Option.none())
        const firstPlan = yield* planned(asked, 'first', first.statement)
        const last = first.result.edges.at(-1)
        if (last === undefined) return [firstPlan]
        const later = yield* page(asked, Option.some(last.id))
        return [firstPlan, yield* planned(asked, 'later', later.statement)]
      }),
    ).pipe(Effect.map(plans => plans.flat()))
  }).pipe(Effect.map(plans => plans.flat()))
