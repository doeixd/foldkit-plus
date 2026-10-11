/**
 * Attaching a guard set's guards to an Entity, per surface and interaction,
 * as metadata only `foldkit-guard` reads. See `guard-DESIGN.md` §3.2.
 */
import { Match, Option, type Schema } from 'effect'
import { Entity, Query, ReadFilter, type AnyEntity } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import type { PrincipalGuard, RowGuard } from './index.js'

declare const InteractionBrand: unique symbol

/** An interaction the application names, used as a computed key: `[Archive.key]`. */
export type InteractionKey<Name extends string = string> = Name & {
  readonly [InteractionBrand]: Name
}

export interface Interaction<Name extends string> {
  readonly name: Name
  readonly key: InteractionKey<Name>
}

/** The interactions every row has, and the ones a relation member has. */
const builtIn = ['Read', 'Create', 'Update', 'Delete', 'Write', 'Link', 'Unlink'] as const

export const Interaction = {
  /** An interaction beyond Read, Create, Update and Delete, such as `Archive`. */
  make: <const Name extends string>(name: Name): Interaction<Name> => {
    if ((builtIn as ReadonlyArray<string>).includes(name)) {
      throw new Error(`[foldkit-guard] Interaction.make: "${name}" is an interaction already`)
    }
    return Object.freeze({ name, key: name as InteractionKey<Name> })
  },
}

/** Every guard of `Rules` must allow, as one guard: `Guards.all(signedIn, isOwner)`. */
export interface All<Rules> {
  readonly _tag: 'All'
  readonly rules: ReadonlyArray<Rules>
}

/** This row's Read is the Read of the row its `one` relation points at. */
export interface Inherit<Relation extends string> {
  readonly _tag: 'Inherit'
  readonly relation: Relation
}

/** What a member hidden by its Read guards reads as instead of its value. */
export interface Redact<A> {
  readonly _tag: 'Redact'
  readonly value: A
}

/** A refused write's sentence, for the application's own users. */
export interface Explain {
  readonly _tag: 'Explain'
  readonly reason: string
}

/**
 * What a refusal looks like. The defaults need no constructor: a row Read
 * answers `NotFound`, a member or relation Read `Omit`, a write `Forbidden`.
 */
export type Deny =
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Omit' }
  | Redact<unknown>
  | { readonly _tag: 'Forbidden' }
  | Explain

/** A surface's guards with a refusal other than its default. */
export interface On<Rules, D extends Deny> {
  readonly _tag: 'On'
  readonly rules: ReadonlyArray<Rules>
  readonly deny: D
}

/** Anything a surface's list may hold, of any guard set. */
export type AnyRule =
  PrincipalGuard<any, string> | RowGuard<any, AnyEntity, string> | All<any> | Inherit<string>

/**
 * What a surface of the Entity named `Name` accepts from the guard set `Set`:
 * its principal guards, its row guards over that Entity, and conjunctions of
 * both. A row guard over another Entity, or a guard of another set, is refused.
 */
export type RuleFor<User, Set extends string, Name extends string> =
  | PrincipalGuard<User, Set>
  | RowGuard<User, Entity<Name, any, any, any>, Set>
  | All<RuleFor<User, Set, Name>>

type Slot<Rule, D extends Deny> = ReadonlyArray<Rule> | On<Rule, D>

type WriteSlot<Rule> = Slot<Rule, Explain>

type OneRelations<E extends AnyEntity> = {
  [K in keyof E['relations']]: E['relations'][K] extends { readonly cardinality: 'one' } ? K : never
}[keyof E['relations']] &
  string

type MemberKeys<E extends AnyEntity> = (keyof E['fields'] | keyof E['derived']) & string

type TypeOf<E extends AnyEntity, K extends keyof E['members']> = E['members'][K]['schema']['Type']

/** What `Guards.attach` takes for the Entity `E`, every key checked against it. */
export type Attach<User, Set extends string, E extends AnyEntity> = {
  readonly row?: {
    readonly Read?: ReadonlyArray<RuleFor<User, Set, E['name']> | Inherit<OneRelations<E>>>
    readonly Create?: WriteSlot<RuleFor<User, Set, E['name']>>
    readonly Update?: WriteSlot<RuleFor<User, Set, E['name']>>
    readonly Delete?: WriteSlot<RuleFor<User, Set, E['name']>>
    /** The same guards on Create, Update and Delete. */
    readonly Write?: WriteSlot<RuleFor<User, Set, E['name']>>
  }
  /**
   * The row's interactions the application named, by key:
   * `{ [Archive.key]: [G.isAdmin] }`. Apart from `row`, whose `Read` may
   * inherit: a literal with a computed key is typed as an index signature,
   * which `Read`'s rules would have to fit too.
   */
  readonly interactions?: {
    readonly [K: InteractionKey]: WriteSlot<RuleFor<User, Set, E['name']>>
  }
  /** Narrow a field or derived member: a member is reachable only if its row is. */
  readonly members?: {
    readonly [K in MemberKeys<E>]?: {
      readonly Read?: Slot<RuleFor<User, Set, E['name']>, Redact<TypeOf<E, K>>>
      /** When absent, `Update`'s guards govern setting the member on creation too. */
      readonly Create?: WriteSlot<RuleFor<User, Set, E['name']>>
      readonly Update?: WriteSlot<RuleFor<User, Set, E['name']>>
    }
  }
  readonly relations?: {
    readonly [K in keyof E['relations']]?: {
      readonly Read?: ReadonlyArray<RuleFor<User, Set, E['name']>>
      readonly Link?: WriteSlot<RuleFor<User, Set, E['name']>>
      readonly Unlink?: WriteSlot<RuleFor<User, Set, E['name']>>
    }
  }
  /** ANDed with every surface's guards, and never out-voted by them. */
  readonly always?: ReadonlyArray<RuleFor<User, Set, E['name']>>
}

/** One surface's guards as attached: a disjunction, and a refusal if one was chosen. */
export interface Surface {
  readonly rules: ReadonlyArray<AnyRule>
  readonly deny: Option.Option<Deny>
}

type Surfaces = Readonly<Record<string, Surface>>

/** An Entity's guards, every attachment merged. */
export interface Attachment {
  readonly set: string
  readonly unguarded: 'allow' | 'deny'
  readonly row: Surfaces
  readonly members: Readonly<Record<string, Surfaces>>
  readonly relations: Readonly<Record<string, Surfaces>>
  readonly always: ReadonlyArray<AnyRule>
}

/** Which surface a rule is asked about. */
type Target =
  | { readonly _tag: 'Row'; readonly interaction: string }
  | { readonly _tag: 'Member'; readonly member: string; readonly interaction: string }
  | { readonly _tag: 'Relation'; readonly relation: string; readonly interaction: string }

const record = <A>(): Record<string, A> => Object.create(null)

const appendSurface = (into: Record<string, Surface>, interaction: string, added: Surface) => {
  const before = into[interaction]
  into[interaction] =
    before === undefined
      ? added
      : {
          rules: [...before.rules, ...added.rules],
          deny: Option.orElse(added.deny, () => before.deny),
        }
}

const appendSurfaces = (into: Record<string, Surface>, added: Surfaces) => {
  for (const [interaction, surface] of Object.entries(added)) {
    appendSurface(into, interaction, surface)
  }
}

const freezeSurfaces = (surfaces: Record<string, Surfaces>) => {
  for (const key of Object.keys(surfaces)) Object.freeze(surfaces[key])
  return Object.freeze(surfaces)
}

/** Later attachments append to each surface's disjunction and replace its refusal. */
const mergeAttachments = (attachments: ReadonlyArray<Attachment>): Attachment => {
  const row = record<Surface>()
  const members = record<Record<string, Surface>>()
  const relations = record<Record<string, Surface>>()
  const always: Array<AnyRule> = []
  for (const attachment of attachments) {
    appendSurfaces(row, attachment.row)
    for (const [key, surfaces] of Object.entries(attachment.members)) {
      appendSurfaces((members[key] ??= record()), surfaces)
    }
    for (const [key, surfaces] of Object.entries(attachment.relations)) {
      appendSurfaces((relations[key] ??= record()), surfaces)
    }
    always.push(...attachment.always)
  }
  const { set, unguarded } = attachments[0]!
  return Object.freeze({
    set,
    unguarded,
    row: Object.freeze(row),
    members: freezeSurfaces(members),
    relations: freezeSurfaces(relations),
    always: Object.freeze(always),
  })
}

const showRule = (rule: AnyRule): string =>
  Match.valueTags(rule, {
    PrincipalGuard: ({ name }) => name,
    RowGuard: ({ name }) => name,
    All: ({ rules }) => `all(${rules.map(showRule).join(', ')})`,
    Inherit: ({ relation }) => `inherit(${relation})`,
  })

const showDeny = (deny: Deny): string =>
  Match.valueTags(deny, {
    NotFound: () => 'not_found',
    Omit: () => 'omit',
    Redact: ({ value }) => `redact(${JSON.stringify(value)})`,
    Forbidden: () => 'forbidden',
    Explain: ({ reason }) => `explain(${JSON.stringify(reason)})`,
  })

const notFound: Deny = Object.freeze({ _tag: 'NotFound' })
const omit: Deny = Object.freeze({ _tag: 'Omit' })
const forbidden: Deny = Object.freeze({ _tag: 'Forbidden' })

/** The refusal a surface takes when none was chosen. */
export const defaultDeny = (target: Target): Deny =>
  target.interaction === 'Read'
    ? Match.valueTags(target, { Row: () => notFound, Member: () => omit, Relation: () => omit })
    : forbidden

/** The guards a surface carries; `none` where it falls to the set's `unguarded`. */
export const surfaceOf = (attachment: Attachment, target: Target): Option.Option<Surface> =>
  Match.valueTags(target, {
    Row: ({ interaction }) => Option.fromUndefinedOr(attachment.row[interaction]),
    Member: ({ member, interaction }) => {
      const surfaces = attachment.members[member]
      if (surfaces === undefined) return Option.none()
      const own = surfaces[interaction]
      // A member a caller may not change is rarely one it may set freely on creation.
      return Option.fromUndefinedOr(
        own === undefined && interaction === 'Create' ? surfaces['Update'] : own,
      )
    },
    Relation: ({ relation, interaction }) =>
      Option.fromUndefinedOr(attachment.relations[relation]?.[interaction]),
  })

const key = Metadata.key<Attachment>('foldkit-guard/attachment', {
  merge: attachments => [mergeAttachments(attachments)],
  summarize: attachment =>
    linesOf(attachment)
      .map(([where, rule]) => `${where}: ${rule}`)
      .join('; '),
})

/** The rows of an attachment's matrix: each surface it decides, and how. */
const linesOf = (attachment: Attachment): ReadonlyArray<readonly [string, string]> => {
  const open = attachment.unguarded === 'allow' ? 'open' : 'closed'
  const show = (target: Target) =>
    Option.match(surfaceOf(attachment, target), {
      onNone: () => open,
      onSome: ({ rules, deny }) =>
        // An empty disjunction allows no one.
        `${rules.length === 0 ? 'nobody' : rules.map(showRule).join(' | ')} → ${showDeny(Option.getOrElse(deny, () => defaultDeny(target)))}`,
    })
  const interactions = [
    'Read',
    'Create',
    'Update',
    'Delete',
    ...Object.keys(attachment.row).filter(interaction => !builtIn.includes(interaction as never)),
  ]
  return [
    ...(attachment.always.length > 0
      ? [['always', attachment.always.map(showRule).join(' & ')] as const]
      : []),
    ...interactions.map(interaction => [interaction, show({ _tag: 'Row', interaction })] as const),
    ...Object.keys(attachment.members).flatMap(member =>
      ['Read', 'Create', 'Update'].flatMap(interaction => {
        const target: Target = { _tag: 'Member', member, interaction }
        return Option.isSome(surfaceOf(attachment, target))
          ? [[`${member}.${interaction}`, show(target)] as const]
          : []
      }),
    ),
    ...Object.entries(attachment.relations).flatMap(([relation, surfaces]) =>
      Object.keys(surfaces).map(
        interaction =>
          [
            `${relation}.${interaction}`,
            show({ _tag: 'Relation', relation, interaction }),
          ] as const,
      ),
    ),
  ]
}

const isOn = (slot: ReadonlyArray<AnyRule> | On<AnyRule, Deny>): slot is On<AnyRule, Deny> =>
  !Array.isArray(slot)

const surfaceFrom = (slot: ReadonlyArray<AnyRule> | On<AnyRule, Deny>): Surface =>
  isOn(slot)
    ? { rules: slot.rules, deny: Option.some(slot.deny) }
    : { rules: Object.freeze([...slot]), deny: Option.none() }

/** Throws for a row guard over another Entity that shares the target's name. */
const checkRules = (
  set: string,
  entity: AnyEntity,
  where: string,
  rules: ReadonlyArray<AnyRule>,
): void => {
  for (const rule of rules) {
    Match.valueTags(rule, {
      PrincipalGuard: () => {},
      RowGuard: guard => {
        if (!Entity.same(guard.entity, entity)) {
          throw new Error(
            `[foldkit-guard] ${set}.attach: ${where} names ${guard.name}, a guard over another Entity named ${entity.name}`,
          )
        }
      },
      All: ({ rules }) => checkRules(set, entity, where, rules),
      Inherit: () => {},
    })
  }
}

const surfacesFrom = (
  set: string,
  entity: AnyEntity,
  where: string,
  slots: Readonly<Record<string, ReadonlyArray<AnyRule> | On<AnyRule, Deny> | undefined>>,
): Surfaces => {
  const surfaces = record<Surface>()
  for (const [interaction, slot] of Object.entries(slots)) {
    if (slot === undefined) continue
    const added = surfaceFrom(slot)
    checkRules(set, entity, `${where}${interaction}`, added.rules)
    // Write is shorthand, so it is stored as the three it stands for.
    for (const each of interaction === 'Write' ? ['Create', 'Update', 'Delete'] : [interaction]) {
      appendSurface(surfaces, each, added)
    }
  }
  return Object.freeze(surfaces)
}

const nested = (
  set: string,
  entity: AnyEntity,
  given: Readonly<
    Record<
      string,
      Readonly<Record<string, ReadonlyArray<AnyRule> | On<AnyRule, Deny> | undefined>> | undefined
    >
  >,
): Readonly<Record<string, Surfaces>> => {
  const surfaces = record<Surfaces>()
  for (const [member, slots] of Object.entries(given)) {
    if (slots !== undefined) surfaces[member] = surfacesFrom(set, entity, `${member}.`, slots)
  }
  return Object.freeze(surfaces)
}

/** A row guard's own fields, and the relation an inherited Read follows. */
const membersRead = (rule: AnyRule): ReadonlyArray<string> =>
  Match.valueTags(rule, {
    PrincipalGuard: () => [],
    RowGuard: ({ query }) => Query.dependencies(query).predicate.map(field => field.key),
    All: ({ rules }) => rules.flatMap(membersRead),
    Inherit: ({ relation }) => [relation],
  })

export const attached = (entity: AnyEntity): Option.Option<Attachment> =>
  Option.fromUndefinedOr(key.get(entity.metadata)[0])

export const Attaching = {
  /**
   * Attaches guards to an Entity, per surface and interaction. A surface's list
   * is a disjunction; `always` is ANDed after it. Attaching twice appends to a
   * surface's list and replaces its refusal.
   */
  attach:
    <Name extends string, User, E extends AnyEntity>(
      G: {
        readonly name: Name
        readonly schema: Schema.Codec<User, unknown>
        readonly unguarded: 'allow' | 'deny'
      },
      config: Attach<NoInfer<User>, NoInfer<Name>, E>,
    ) =>
    (entity: E): E => {
      Option.map(attached(entity), ({ set }) => {
        if (set !== G.name) {
          throw new Error(
            `[foldkit-guard] ${G.name}.attach: ${entity.name} carries the guards of ${set} already`,
          )
        }
      })
      const always = config.always ?? []
      checkRules(G.name, entity, 'always', always)
      const attachment: Attachment = Object.freeze({
        set: G.name,
        unguarded: G.unguarded,
        // A named interaction is the row's, as the matrix and the decisions read it.
        row: surfacesFrom(G.name, entity, '', { ...config.row, ...config.interactions }),
        members: nested(G.name, entity, config.members ?? {}),
        relations: nested(G.name, entity, config.relations ?? {}),
        always: Object.freeze([...always]),
      })
      // What the row's Read rules read, so a client placing rows knows it cannot judge a change to them.
      const filtered = [
        ...new Set(
          [...(attachment.row['Read']?.rules ?? []), ...attachment.always].flatMap(membersRead),
        ),
      ]
      return entity.pipe(
        Entity.annotate(Metadata.combine([key.of(attachment), ReadFilter.of(filtered)])),
      )
    },

  /** The guards attached to `entity`, every attachment merged. */
  attached,

  /** Every rule must allow, as one rule. Principal and row guards may mix. */
  all: <const Rules extends ReadonlyArray<Exclude<AnyRule, Inherit<string>>>>(
    ...rules: Rules
  ): All<Rules[number]> => Object.freeze({ _tag: 'All', rules: Object.freeze([...rules]) }),

  /** This row's Read is the Read of the row its `one` relation points at. */
  inherit: <const Relation extends string>(relation: Relation): Inherit<Relation> =>
    Object.freeze({ _tag: 'Inherit', relation }),

  /** A surface's guards with a refusal other than its default. */
  on: <const Rules extends ReadonlyArray<AnyRule>, D extends Redact<unknown> | Explain>(
    rules: Rules,
    deny: D,
  ): On<Rules[number], D> => Object.freeze({ _tag: 'On', rules: Object.freeze([...rules]), deny }),

  /** A hidden member reads as `value`, typed by the member's schema. */
  redact: <const A>(value: A): Redact<A> => Object.freeze({ _tag: 'Redact', value }),

  /** A refused write tells the caller `reason`. */
  explain: (reason: string): Explain => Object.freeze({ _tag: 'Explain', reason }),

  /**
   * The members a row interaction's guards read, `always` included: a change
   * to one can change whether a principal may. A relation an inherited Read
   * follows counts.
   */
  guardFields: (
    entity: AnyEntity,
    interaction: 'Read' | 'Create' | 'Update' | 'Delete' | InteractionKey,
  ): ReadonlyArray<string> =>
    Option.match(attached(entity), {
      onNone: () => [],
      onSome: attachment => [
        ...new Set(
          [...(attachment.row[interaction]?.rules ?? []), ...attachment.always].flatMap(
            membersRead,
          ),
        ),
      ],
    }),

  /** Who may do what, one line per surface, for review and for a committed snapshot. */
  matrix: (entities: ReadonlyArray<AnyEntity>): string =>
    entities
      .flatMap(entity =>
        Option.match(attached(entity), {
          onNone: () => [`${entity.name}: no guards`],
          onSome: attachment =>
            linesOf(attachment).map(([where, rule]) => `${entity.name}.${where}: ${rule}`),
        }),
      )
      .join('\n'),
}
