/**
 * Who may do what, declared once on the domain.
 *
 * A guard set names its guards once, in shared code the client imports too.
 * A **principal guard** is declared by name and implemented only on the
 * server (`G.implement`), so its logic never ships. A **row guard** is an
 * `Expr` over one Entity's fields with the principal's fields as inputs: data,
 * which the SQL compiler and `evaluate` both run. See `guard-DESIGN.md`.
 */
import { Context, Effect, Match, Option, Schema } from 'effect'
import { Attaching, attached, type InteractionKey } from './attach.js'
import {
  deciding,
  readsPrincipal,
  type Condition,
  type MemberRead,
  type RowRule,
} from './condition.js'
import { May } from './may.js'
import { me } from './me.js'
import { providedFrom } from './origin.js'
import {
  Expr,
  Operators,
  Query,
  evaluate,
  type AnyEntity,
  type EntityRef,
  type ExprContext,
  type MemoryOperators,
  type AnyQuery,
  type InputExpr,
  type Predicate,
} from 'foldkit-entity'

/** A guard's answer: allowed, refused, or refused with a sentence the caller may read. */
export type Decision = boolean | { readonly allowed: false; readonly reason: string }

/** What a principal guard is asked about. */
export interface About {
  /** The interaction attempted: `Read`, `Update`, or one the application names. */
  readonly interaction: string
}

/**
 * The principal's fields as a row guard's body sees them: each an input named
 * `principal.<field>`, typed as the field. A body is built once, so it holds
 * these placeholders and never a value: branching on one is a type error.
 */
export type Placeholders<User> = {
  readonly [K in keyof User & string]: InputExpr<User[K]>
}

/** What `guard.principal()` declares: a name whose body the server supplies. */
export interface PrincipalSpec {
  readonly _tag: 'PrincipalSpec'
}

/** What `guard.row(entity, body)` declares: a predicate over one Entity's rows. */
export interface RowSpec<E extends AnyEntity> {
  readonly _tag: 'RowSpec'
  readonly entity: E
  readonly body: Predicate
}

type AnySpec = PrincipalSpec | RowSpec<AnyEntity>

/**
 * The principal a guard is for, kept in the type so a guard of one principal
 * cannot stand where another's is wanted. A function type, so it is invariant.
 */
interface ForPrincipal<User> {
  readonly '~principal'?: (user: User) => User
}

/** A guard whose body lives on the server, asked of the principal alone. */
export interface PrincipalGuard<User, Set extends string = string> extends ForPrincipal<User> {
  readonly _tag: 'PrincipalGuard'
  readonly name: string
  /** The name of the guard set it belongs to. */
  readonly set: Set
}

/** A guard over the rows of `E`: its predicate, and the query that asks it of rows. */
export interface RowGuard<
  User,
  E extends AnyEntity,
  Set extends string = string,
> extends ForPrincipal<User> {
  readonly _tag: 'RowGuard'
  readonly name: string
  readonly set: Set
  readonly entity: E
  readonly body: Predicate
  /** `from(entity).where(body)`, for an interpreter that runs queries. */
  readonly query: AnyQuery
}

export type AnyGuard<User> = PrincipalGuard<User> | RowGuard<User, AnyEntity>

type GuardOf<User, Set extends string, S> =
  S extends RowSpec<infer E> ? RowGuard<User, E, Set> : PrincipalGuard<User, Set>

/** The keys of a spec record that are principal guards: what `implement` must supply. */
type PrincipalKeys<S> = { [K in keyof S]: S[K] extends PrincipalSpec ? K : never }[keyof S]

/** A principal guard's body, on the server. */
export type Body<User, R = never> = (
  principal: Option.Option<User>,
  about: About,
) => Decision | Effect.Effect<Decision, never, R>

/** Names a guard set reserves for itself, which no guard may take. */
const reserved = [
  'name',
  'schema',
  'Principal',
  'key',
  'unguarded',
  'inputOf',
  'implement',
] as const
type Reserved = (typeof reserved)[number]

/** Who is asking, for one guard set: a visitor is `none`. */
export interface PrincipalOf<Name extends string> {
  readonly '~guardSet': Name
}

/** The guard set of one application, as `Guards.declare` returns it. */
export type GuardSet<Name extends string, User, S> = {
  readonly [K in keyof S]: GuardOf<User, Name, S[K]>
} & {
  readonly name: Name
  /** The principal's schema, whose fields the row guards read. */
  readonly schema: Schema.Codec<User, unknown>
  /** The server's Context key for who is asking. Authentication provides it. */
  readonly Principal: Context.Service<PrincipalOf<Name>, Option.Option<User>>
  /** A stable name for the person, whatever their claims: for what is theirs, as a cache's scope. */
  readonly key: (user: User) => string
  readonly unguarded: 'allow' | 'deny'
  /** The principal's fields as row guards' inputs, encoded as stored values are. */
  readonly inputOf: (user: User) => Readonly<Record<string, unknown>>
  /**
   * The bodies of the principal guards: every one, and nothing else. `operators`
   * runs the row guards' primitive operators in memory; `Operators.kernel` when
   * not given.
   */
  readonly implement: <R = never>(
    bodies: { readonly [K in PrincipalKeys<S>]: Body<User, R> },
    options?: { readonly operators?: MemoryOperators | undefined },
  ) => Policy<User, R>
}

/** The server's half of a guard set: every principal guard's body. */
export interface Policy<User, R = never> {
  readonly set: string
  /**
   * How a row guard's primitive operators are run in memory: by `decide`,
   * `Condition.holds` and every guarded server judging a row. Given to
   * `implement`; `Operators.kernel` when not.
   */
  readonly operators: MemoryOperators
  /**
   * Whether `guard` allows `principal`, for a row guard over `row` (its stored,
   * encoded values). A visitor passes no row guard that reads a principal's
   * fields; one over the row alone holds for a visitor too.
   */
  readonly decide: (
    guard: AnyGuard<User>,
    request: {
      readonly principal: Option.Option<User>
      readonly interaction: string
      readonly row?: Readonly<Record<string, unknown>> | undefined
    },
  ) => Effect.Effect<Decision, never, R>
  /**
   * Which rows of `entity` `principal` may read, as a condition over the row
   * with every principal guard already decided. An Entity without guards, or
   * of no set, reads `Always`.
   */
  readonly readable: (
    entity: AnyEntity,
    principal: Option.Option<User>,
  ) => Effect.Effect<Condition, never, R>
  /** The read rule of each of `members`, relations included, that has one, decided for `principal`. */
  readonly readMembers: (
    entity: AnyEntity,
    principal: Option.Option<User>,
    members: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<MemberRead>, never, R>
  /**
   * Which rows of `entity` `principal` may write by `interaction` (`Create`,
   * `Update`, `Delete`, or one the application named), as a condition over
   * the row, and what a refusal shows.
   */
  readonly writable: (
    entity: AnyEntity,
    principal: Option.Option<User>,
    interaction: 'Create' | 'Update' | 'Delete' | InteractionKey,
  ) => Effect.Effect<RowRule, never, R>
  /** The rule of each of `members` that has one for setting it, decided for `principal`. */
  readonly writeMembers: (
    entity: AnyEntity,
    principal: Option.Option<User>,
    members: ReadonlyArray<string>,
    interaction: 'Create' | 'Update',
  ) => Effect.Effect<ReadonlyArray<MemberRead>, never, R>
  /** A relation's rule for linking or unlinking a row, when it has one. */
  readonly linkable: (
    entity: AnyEntity,
    principal: Option.Option<User>,
    relation: string,
    interaction: 'Link' | 'Unlink',
  ) => Effect.Effect<Option.Option<RowRule>, never, R>
  /** The principal's fields as row guards' inputs; a visitor has none. */
  readonly inputOf: (principal: Option.Option<User>) => Readonly<Record<string, unknown>>
  /**
   * Who the principal is as a row: `declare`'s `viewer` Entity, by `key`.
   * What a rule's `Expr.viewer` reads, and the server's viewer:
   * `RemoteServer.make({ viewer: Policy.viewer })`. None for a visitor, and
   * for a set that names no `viewer`.
   */
  readonly viewer: (principal: Option.Option<User>) => Option.Option<EntityRef>
  /**
   * Who the principal is: `declare`'s `key`, the same function as `G.key`,
   * here for a server seam that holds the Policy and not the set. Not
   * `keyOf`, which names a principal by every field, for sharing re-reads.
   */
  readonly key: (user: User) => string
  /**
   * Who is asking, as the rules see it: every field of the principal, encoded,
   * a visitor included. Two requests by one person with the same claims answer
   * alike, so a live hub shares their re-reads; a changed claim is not shared.
   *
   * ```ts
   * RemoteServer.liveHub(sources, { key: Policy.keyOf })
   * ```
   */
  readonly keyOf: (principal: Option.Option<User>) => string
  /**
   * Whether `value` is this set's principal, an `Option` of its schema: for a
   * seam that is handed the principal untyped.
   */
  readonly isPrincipal: (value: unknown) => value is Option.Option<User>
  /**
   * This Policy with services its bodies need provided, such as a membership
   * lookup. The read seams (`GuardDrizzle.visible`, `GuardServer.memory`,
   * `GuardSync`) take a Policy that needs nothing more: a read rule runs inside
   * a read whose requirements are its Source's. Provide what stays put here,
   * once; carry what changes per request in the principal. A seam built from
   * the result counts as built from this Policy: `validate` checks the rules,
   * not the services given them. `GuardSync.authorize` runs bodies
   * synchronously, so what it is given must answer without suspending.
   *
   * ```ts
   * const ReadPolicy = Policy.provide(Context.make(Memberships, memberships))
   * ```
   */
  readonly provide: <Provided extends R>(
    context: Context.Context<Provided>,
  ) => Policy<User, Exclude<R, Provided>>
}

/** `policy` with `context` provided to every body it runs. */
const provided = <User, R, Provided extends R>(
  policy: Policy<User, R>,
  context: Context.Context<Provided>,
): Policy<User, Exclude<R, Provided>> => {
  const run = <A>(effect: Effect.Effect<A, never, R>) => Effect.provide(effect, context)
  const next: Policy<User, Exclude<R, Provided>> = {
    ...policy,
    decide: (guard, request) => run(policy.decide(guard, request)),
    readable: (entity, principal) => run(policy.readable(entity, principal)),
    readMembers: (entity, principal, members) =>
      run(policy.readMembers(entity, principal, members)),
    writable: (entity, principal, interaction) =>
      run(policy.writable(entity, principal, interaction)),
    writeMembers: (entity, principal, members, interaction) =>
      run(policy.writeMembers(entity, principal, members, interaction)),
    linkable: (entity, principal, relation, interaction) =>
      run(policy.linkable(entity, principal, relation, interaction)),
    provide: more => provided(next, more),
  }
  return providedFrom(next, policy)
}

/** The builders a guard set's declaration is given, typed by its principal. */
export interface Builders<User> {
  /** A guard decided from the principal alone, by a body only the server has. */
  readonly principal: () => PrincipalSpec
  /** A guard over `entity`'s rows: a predicate with the principal's fields as inputs. */
  readonly row: <E extends AnyEntity>(
    entity: E,
    body: (principal: Placeholders<User>) => Predicate,
  ) => RowSpec<E>
}

const placeholdersOf = <User>(fields: Schema.Struct.Fields): Placeholders<User> =>
  // Built as entries, so a field named `__proto__` is a key of its own, not the prototype.
  Object.freeze(
    Object.fromEntries(
      Object.entries(fields).map(([key, schema]): [string, InputExpr<unknown>] => [
        key,
        Expr.input(`principal.${key}`, schema as unknown as Schema.Codec<unknown, unknown>),
      ]),
    ),
  ) as Placeholders<User>

export { Condition, type MemberRead, type RowRule } from './condition.js'
export { May, MaySchema, type MayAnswer } from './may.js'
export { ME, type MeEntity } from './me.js'
export {
  Interaction,
  type All,
  type AnyRule,
  type Attach,
  type Attachment,
  type Deny,
  type Explain,
  type Inherit,
  type InteractionKey,
  type On,
  type Redact,
  type RuleFor,
  type Surface,
} from './attach.js'

export const Guards = {
  ...Attaching,
  /**
   * Adds the `may` member, the server's answer to what a principal may do
   * with a row, after its guards are attached:
   * `TodoFields.pipe(Guards.attach(G, { … }), Guards.may)`.
   */
  may: May.member,
  /**
   * `Me`, the visitor as an Entity: one row, `me`, that everyone reads and no
   * one writes, with `signedIn`, the principal's `key`, and `may` for the
   * interactions named here. Serve it with `GuardServer.me`.
   *
   * ```ts
   * export const Me = Guards.me(G, { interactions: { [OpenAdmin.key]: [G.isAdmin] } })
   * ```
   */
  me,
  /**
   * One application's guards, under `name` (its principal's Context key, and
   * what the matrix prints). `principal` is a `Schema.Struct`: its fields are
   * what a row guard reads, and its codec encodes a principal's values as
   * stored values are encoded.
   *
   * ```ts
   * const G = Guards.declare('Todos', User, guard => ({
   *   isAdmin: guard.principal(),
   *   isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
   * }), { key: user => user.id })
   * ```
   */
  declare: <
    const Name extends string,
    Fields extends Schema.Struct.Fields,
    const S extends Readonly<Record<string, AnySpec>> & { readonly [K in Reserved]?: never },
  >(
    name: Name,
    principal: Schema.Struct<Fields>,
    build: (guard: Builders<Schema.Struct.Type<Fields>>) => S,
    options: {
      readonly key: (user: Schema.Struct.Type<Fields>) => string
      /**
       * What a surface of a guarded Entity with no rules decides: `'deny'`
       * refuses it, `'allow'` lets everyone. Required, so an open surface is
       * a decision written down; `Guards.matrix` prints it `closed` or `open`.
       */
      readonly unguarded: 'allow' | 'deny'
      /**
       * The Entity whose row each principal is, by `key`: what a row guard's
       * `Expr.viewer` of it reads, on the server and the client alike. A set
       * without one refuses a rule that reads the viewer.
       */
      readonly viewer?: AnyEntity | undefined
    },
  ): GuardSet<Name, Schema.Struct.Type<Fields>, S> => {
    type User = Schema.Struct.Type<Fields>
    // The type requires it; a caller without types (or one that spelled it
    // `'Allow'`) would otherwise get a set that denies, silently.
    if (options.unguarded !== 'allow' && options.unguarded !== 'deny')
      throw new Error(
        `[foldkit-guard] ${name}: unguarded must be 'allow' or 'deny', not ${JSON.stringify(options.unguarded)}`,
      )
    const placeholders = placeholdersOf<User>(principal.fields)
    const specs = build({
      principal: () => Object.freeze({ _tag: 'PrincipalSpec' }),
      row: (entity, body) => {
        const predicate = body(placeholders)
        const { operations } = Query.dependencies(Query.from(entity).pipe(Query.where(predicate)))
        // Who may is decided when asked, not at a write's time, which the rule is never given.
        if (operations.includes('now')) {
          throw new Error(
            `[foldkit-guard] ${name}: a rule over ${entity.name} reads Expr.now; who may do something does not move with the clock here`,
          )
        }
        if (operations.includes('viewer') && options.viewer === undefined) {
          throw new Error(
            `[foldkit-guard] ${name}: a rule over ${entity.name} reads Expr.viewer, but the set names no viewer Entity; declare it with { viewer }`,
          )
        }
        return Object.freeze({ _tag: 'RowSpec', entity, body: predicate })
      },
    })
    const guards: Record<string, AnyGuard<User>> = Object.create(null)
    for (const [guard, spec] of Object.entries(specs)) {
      if ((reserved as ReadonlyArray<string>).includes(guard)) {
        throw new Error(
          `[foldkit-guard] ${name}: "${guard}" is a name the guard set keeps for itself`,
        )
      }
      guards[guard] = Match.valueTags(spec, {
        PrincipalSpec: (): AnyGuard<User> =>
          Object.freeze({ _tag: 'PrincipalGuard', name: guard, set: name }),
        RowSpec: ({ entity, body }): AnyGuard<User> =>
          Object.freeze({
            _tag: 'RowGuard',
            name: guard,
            set: name,
            entity,
            body,
            // Checks the body reads only this Entity's fields, where it is declared.
            query: Query.from(entity).pipe(Query.where(body)),
          }),
      })
    }
    const principalNames = Object.keys(guards).filter(
      guard => guards[guard]!._tag === 'PrincipalGuard',
    )
    const encoders = Object.fromEntries(
      Object.entries(principal.fields).map(([field, schema]) => [
        field,
        Schema.encodeSync(schema as unknown as Schema.Codec<unknown, unknown>),
      ]),
    )
    const inputOf = (user: User): Readonly<Record<string, unknown>> => {
      const input: Record<string, unknown> = {}
      for (const [field, encode] of Object.entries(encoders)) {
        input[`principal.${field}`] = encode((user as Record<string, unknown>)[field])
      }
      return input
    }

    const viewerOf = (user: Option.Option<User>): Option.Option<EntityRef> =>
      Option.flatMap(Option.fromUndefinedOr(options.viewer), entity =>
        Option.map(user, each => ({ entity: entity.name, id: options.key(each) })),
      )
    // A rule reads who asks, never a time.
    const contextOf = (user: Option.Option<User>): ExprContext => ({
      viewer: viewerOf(user),
      now: Option.none(),
    })

    const isPrincipal = Schema.is(Schema.Option(principal))
    // Every claim as JSON keeps it, a set, a number past JSON's or a date
    // included: two principals that differ in one never share a key.
    const asJson = Schema.encodeSync(
      Schema.toCodecJson(principal) as unknown as Schema.Codec<unknown, unknown>,
    )

    const implement = <R>(
      bodies: Readonly<Record<string, Body<User, R>>>,
      implementation: { readonly operators?: MemoryOperators | undefined } = {},
    ): Policy<User, R> => {
      const operators = implementation.operators ?? Operators.kernel
      const missing = principalNames.filter(guard => !Object.hasOwn(bodies, guard))
      const extra = Object.keys(bodies).filter(guard => !principalNames.includes(guard))
      if (missing.length > 0 || extra.length > 0) {
        throw new Error(
          `[foldkit-guard] ${name}.implement: ${[
            missing.length > 0 ? `no body for ${missing.join(', ')}` : '',
            extra.length > 0 ? `${extra.join(', ')} is not a principal guard` : '',
          ]
            .filter(part => part !== '')
            .join('; ')}`,
        )
      }
      const decide: Policy<User, R>['decide'] = (guard, { principal, interaction, row }) => {
        if (guard.set !== name) {
          return Effect.die(
            new Error(`[foldkit-guard] ${name}: "${guard.name}" belongs to ${guard.set}`),
          )
        }
        return Match.valueTags(guard, {
          PrincipalGuard: ({ name: body }) => {
            const decided = bodies[body]!(principal, { interaction })
            return Effect.isEffect(decided) ? decided : Effect.succeed(decided)
          },
          RowGuard: rowGuard =>
            Effect.succeed(
              row !== undefined &&
                Option.match(principal, {
                  // A visitor has no fields: only a guard over the row alone can hold.
                  onNone: () =>
                    !readsPrincipal(rowGuard) &&
                    evaluate(rowGuard.query, {}, [row], {
                      operators,
                      context: contextOf(principal),
                    }).length === 1,
                  onSome: user =>
                    evaluate(rowGuard.query, inputOf(user), [row], {
                      operators,
                      context: contextOf(principal),
                    }).length === 1,
                }),
            ),
        })
      }
      const decidingFor = (
        entity: AnyEntity,
        principal: Option.Option<User>,
        interaction: string,
      ) => {
        Option.map(attached(entity), ({ set }) => {
          if (set !== name) {
            throw new Error(`[foldkit-guard] ${name}: ${entity.name} carries the guards of ${set}`)
          }
        })
        return deciding(
          guard =>
            Effect.map(decide(guard, { principal, interaction }), decision => decision === true),
          Option.isNone(principal),
          interaction,
          contextOf(principal),
        )
      }
      const policy: Policy<User, R> = {
        set: name,
        operators,
        decide,
        readable: (entity, principal) =>
          Effect.map(
            decidingFor(entity, principal, 'Read').row(entity),
            ({ condition }) => condition,
          ),
        readMembers: (entity, principal, members) =>
          decidingFor(entity, principal, 'Read').members(entity, members),
        writable: (entity, principal, interaction) =>
          decidingFor(entity, principal, interaction).row(entity),
        writeMembers: (entity, principal, members, interaction) =>
          decidingFor(entity, principal, interaction).members(entity, members),
        linkable: (entity, principal, relation, interaction) =>
          decidingFor(entity, principal, interaction).relation(entity, relation),
        inputOf: principal =>
          Option.match(principal, { onNone: () => ({}), onSome: user => inputOf(user) }),
        viewer: viewerOf,
        key: options.key,
        // Prefixed, so no user's key is the visitor's. Not `declare`'s `key`
        // alone: a re-read shared under it would read a newer request as an
        // older one's claims.
        keyOf: principal =>
          Option.match(principal, {
            onNone: () => 'visitor',
            onSome: user => `user:${JSON.stringify(asJson(user))}`,
          }),
        isPrincipal,
        provide: context => provided(policy, context),
      }
      return policy
    }

    return Object.freeze({
      ...guards,
      name,
      schema: principal as unknown as Schema.Codec<User, unknown>,
      Principal: Context.Service<PrincipalOf<Name>, Option.Option<User>>(
        `foldkit-guard/Principal/${name}`,
      ),
      key: options.key,
      unguarded: options.unguarded,
      inputOf,
      implement,
    }) as unknown as GuardSet<Name, User, S>
  },
}
