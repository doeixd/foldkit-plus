/**
 * A guard set's read rules as `foldkit-remote-drizzle` bindings' `visible`:
 * each principal guard decided, what is left compiled to SQL over the table,
 * and an inherited Read a subquery over the related table's own rule.
 */
import { and, or, sql, type SQL } from 'drizzle-orm'
import { Effect, Match, Option } from 'effect'
import { Query, type AnyEntity } from 'foldkit-entity'
import {
  DrizzleOperators,
  bodyOperations,
  compileWhere,
  idColumn,
  type AnyEntityBinding,
  type Visible,
} from 'foldkit-remote-drizzle'
import { RemoteServerError } from 'foldkit-remote-server'
import { attached, flattenRules, type AnyRule } from './attach.js'
import type { Condition } from './condition.js'
import type { Policy } from './index.js'
import { rowRules } from './placed.js'

// A declaration, not an arrow, so a call narrows what follows it.
function fail(message: string): never {
  throw new Error(`[foldkit-guard] GuardDrizzle.visible: ${message}`)
}

/** Every rule that decides who may read a row of `entity`. */
const readRules = (entity: AnyEntity): ReadonlyArray<AnyRule> =>
  Option.match(attached(entity), {
    onNone: () => [],
    onSome: attachment => [...attachment.always, ...(attachment.row['Read']?.rules ?? [])],
  })

const nothing = sql`1 = 0`

export const GuardDrizzle = {
  /**
   * The `visible` rule of each of `entities`, the Entities as `Guards.attach`
   * returned them, by name, for `bind`'s storage. Checked here, before any
   * request: a row guard this compiler cannot run, and an inherited Read whose
   * Entity is not listed, has no Read rule, or leads back to itself, throw.
   * `operators` is the SQL table each rule is checked against here and compiled
   * by (the kernel's when not given), and the policy's table decides what a rule
   * reads from the input alone, so a server that starts can compile every rule
   * whatever table its bindings were given. Give it the bindings' SQL table, so
   * a rule and a query over one operator compile it alike.
   *
   * ```ts
   * const visible = GuardDrizzle.visible(Policy, [Todo, Project])
   * bind(Domain, { Todo: { table: todos, visible: visible.Todo, … }, … })
   * ```
   */
  visible: <User, const Es extends ReadonlyArray<AnyEntity>>(
    policy: Policy<User>,
    entities: Es,
    options: { readonly operators?: DrizzleOperators | undefined } = {},
  ): { readonly [K in Es[number]['name']]: Visible } => {
    const sqlOperators = options.operators ?? DrizzleOperators.kernel
    const byName = new Map(entities.map(entity => [entity.name, entity] as const))
    const inherits = new Map<string, ReadonlyArray<string>>()
    for (const entity of entities) {
      const targets: Array<string> = []
      for (const rule of flattenRules(readRules(entity))) {
        Match.valueTags(rule, {
          PrincipalGuard: () => {},
          RowGuard: guard => {
            const missing = Query.unsupported(guard.query, bodyOperations, sqlOperators)
            if (missing.length > 0) {
              fail(
                `${entity.name}'s ${guard.name} needs ${missing.join(', ')}, which SQL here does not run`,
              )
            }
          },
          All: () => {},
          Inherit: ({ relation }) => {
            const target = entity.relations[relation]!.target().name
            const guarded = byName.get(target)
            if (guarded === undefined) {
              fail(`${entity.name} inherits ${target}'s Read, but ${target} is not listed`)
            }
            if (readRules(guarded).length === 0) {
              fail(`${entity.name} inherits ${target}'s Read, but ${target} has no Read rule`)
            }
            targets.push(target)
          },
        })
      }
      inherits.set(entity.name, targets)
    }
    // A loop of inherited Reads would be a subquery that never ends.
    const closure = (name: string, path: ReadonlyArray<string>): ReadonlyArray<string> => {
      if (path.includes(name)) fail(`inherited Reads loop: ${[...path, name].join(' → ')}`)
      return [name, ...(inherits.get(name) ?? []).flatMap(next => closure(next, [...path, name]))]
    }
    const reaches = new Map(
      entities.map(entity => [entity.name, [...new Set(closure(entity.name, []))]]),
    )

    const compile = (
      name: string,
      binding: AnyEntityBinding,
      conditions: ReadonlyMap<string, Condition>,
      input: Readonly<Record<string, unknown>>,
    ): SQL | undefined => {
      const of = (condition: Condition): SQL | undefined =>
        Match.valueTags(condition, {
          Always: () => undefined,
          Never: () => nothing,
          // By the tables the rule was checked against: the SQL one given here, and
          // the policy's for what is decided from the input alone, as Guard judges.
          // A rule reads the rows it reaches as they are stored: it is the server's
          // decision, as a principal guard's body is, not a read by the principal.
          Row: ({ guard, context }) =>
            and(
              ...compileWhere(
                guard.query,
                {
                  ...binding,
                  operators: { memory: policy.operators, sql: sqlOperators },
                  context,
                  visibleOf: () => Option.none(),
                },
                input,
                `${name}.${guard.name}`,
              ),
            ),
          And: ({ conditions: parts }) => and(...parts.map(of)),
          // `Condition.or` folds away a part that admits every row, so each part here is SQL.
          Or: ({ conditions: parts }) => or(...parts.map(of)),
          Inherit: ({ relation }) => {
            const storage = binding.relations[relation]
            if (storage === undefined || storage.kind !== 'one') {
              return fail(
                `${name}.${relation} is inherited, so it must be stored as a foreign key here`,
              )
            }
            const target = storage.entity
            const where = compile(target.name, target, conditions, input) ?? sql`1 = 1`
            return sql`${storage.field} in (select ${idColumn(target)} from ${target.table} where ${where})`
          },
        })
      return of(conditions.get(name)!)
    }

    const visible =
      (name: string): Visible =>
      (principal, self) => {
        if (!policy.isPrincipal(principal)) {
          return Effect.die(
            new Error(`[foldkit-guard] ${name}: the principal is not an Option of the guard set's`),
          )
        }
        return Effect.flatMap(
          Effect.forEach(reaches.get(name)!, each =>
            Effect.map(
              policy.readable(byName.get(each)!, principal),
              condition => [each, condition] as const,
            ),
          ),
          decided =>
            Effect.try({
              try: () => compile(name, self, new Map(decided), policy.inputOf(principal)),
              catch: error =>
                new RemoteServerError({
                  message: error instanceof Error ? error.message : String(error),
                }),
            }),
        )
      }
    return Object.fromEntries(
      entities.map(entity => [entity.name, rowRules.add(visible(entity.name), policy, [entity])]),
    ) as {
      readonly [K in Es[number]['name']]: Visible
    }
  },
}
