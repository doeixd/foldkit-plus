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
import { Attaching, attached } from './attach.js'
import { reading, type Condition, type MemberRead } from './condition.js'
import {
  Expr,
  Query,
  evaluate,
  type AnyEntity,
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
  /** A stable name for one principal, so two requests by one person share work. */
  readonly key: (user: User) => string
  readonly unguarded: 'allow' | 'deny'
  /** The principal's fields as row guards' inputs, encoded as stored values are. */
  readonly inputOf: (user: User) => Readonly<Record<string, unknown>>
  /** The bodies of the principal guards: every one, and nothing else. */
  readonly implement: <R = never>(bodies: {
    readonly [K in PrincipalKeys<S>]: Body<User, R>
  }) => Policy<User, R>
}

/** The server's half of a guard set: every principal guard's body. */
export interface Policy<User, R = never> {
  readonly set: string
  /**
   * Whether `guard` allows `principal`, for a row guard over `row` (its stored,
   * encoded values). A visitor passes no row guard, whose body is over a
   * principal's fields.
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
  /** The principal's fields as row guards' inputs; a visitor has none. */
  readonly inputOf: (principal: Option.Option<User>) => Readonly<Record<string, unknown>>
  /**
   * Who is asking, by `declare`'s `key`, a visitor included: two requests by
   * one person answer alike, so a live hub shares their re-reads.
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

const placeholdersOf = <User>(fields: Schema.Struct.Fields): Placeholders<User> => {
  const inputs: Record<string, InputExpr<unknown>> = {}
  for (const key of Object.keys(fields)) {
    inputs[key] = Expr.input(
      `principal.${key}`,
      fields[key] as unknown as Schema.Codec<unknown, unknown>,
    )
  }
  return Object.freeze(inputs) as Placeholders<User>
}

export { Condition, type MemberRead } from './condition.js'
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
      readonly unguarded?: 'allow' | 'deny' | undefined
    },
  ): GuardSet<Name, Schema.Struct.Type<Fields>, S> => {
    type User = Schema.Struct.Type<Fields>
    const placeholders = placeholdersOf<User>(principal.fields)
    const specs = build({
      principal: () => Object.freeze({ _tag: 'PrincipalSpec' }),
      row: (entity, body) => Object.freeze({ _tag: 'RowSpec', entity, body: body(placeholders) }),
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

    const isPrincipal = Schema.is(Schema.Option(principal))

    const implement = <R>(bodies: Readonly<Record<string, Body<User, R>>>): Policy<User, R> => {
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
          RowGuard: ({ query }) =>
            Effect.succeed(
              Option.isSome(principal) &&
                row !== undefined &&
                evaluate(query, inputOf(principal.value), [row]).length === 1,
            ),
        })
      }
      const readingFor = (entity: AnyEntity, principal: Option.Option<User>) => {
        Option.map(attached(entity), ({ set }) => {
          if (set !== name) {
            throw new Error(`[foldkit-guard] ${name}: ${entity.name} carries the guards of ${set}`)
          }
        })
        return reading(
          guard =>
            Effect.map(
              decide(guard, { principal, interaction: 'Read' }),
              decision => decision === true,
            ),
          Option.isNone(principal),
        )
      }
      return {
        set: name,
        decide,
        readable: (entity, principal) => readingFor(entity, principal).readable(entity),
        readMembers: (entity, principal, members) =>
          readingFor(entity, principal).members(entity, members),
        inputOf: principal =>
          Option.match(principal, { onNone: () => ({}), onSome: user => inputOf(user) }),
        // Prefixed, so no user's key is the visitor's.
        keyOf: principal =>
          Option.match(principal, {
            onNone: () => 'visitor',
            onSome: user => `user:${options.key(user)}`,
          }),
        isPrincipal,
      }
    }

    return Object.freeze({
      ...guards,
      name,
      schema: principal as unknown as Schema.Codec<User, unknown>,
      Principal: Context.Service<PrincipalOf<Name>, Option.Option<User>>(
        `foldkit-guard/Principal/${name}`,
      ),
      key: options.key,
      unguarded: options.unguarded ?? 'allow',
      inputOf,
      implement,
    }) as unknown as GuardSet<Name, User, S>
  },
}
