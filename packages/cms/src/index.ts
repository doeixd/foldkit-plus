/**
 * `foldkit-cms` — what a CMS adds to a domain that is already declared: audience
 * (who may see it), time (drafts, revisions, a schedule), and address (a slug).
 *
 * A draft is an unsent form, kept beside the content row and never in it. The
 * row holds what is published; publishing is the application's own mutation,
 * run with the draft's value. This package is the declarations and the pure
 * rules. It reads no database and owns no state; `foldkit-cms-drizzle` is the
 * server, and the screens are `foldkit-crud`'s.
 */
import { Schema } from 'effect'
import {
  Entity,
  Relation,
  Derived,
  type AnyEntity,
  type EntityField,
  type EntityInput,
} from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import { Mutation, Query, type MutationDescriptor, type OptimisticOperation } from 'foldkit-remote'
import { offers, state, type Facts, type State, type Transition } from './lifecycle.js'
import { makeEditor } from './editor.js'
import { Display } from 'foldkit-crud'
import { Kinds } from './kinds.js'

export type { Facts, Schedule, State, StateTag, Transition } from './lifecycle.js'

/** The members of an Entity that play a part a CMS knows: by key. */
export interface RoleKeys<E extends AnyEntity> {
  /** What an entry is called in a list. A text field. */
  readonly label?: TextKey<E>
  /** The address a visitor reaches it by. A text field, unique in its table. */
  readonly slug?: TextKey<E>
  /**
   * Present means a visitor may see the row. A field that admits `null`. Without
   * it a content type cannot be unpublished, and every row is visible.
   */
  readonly published?: NullableKey<E>
}

type TextKey<E extends AnyEntity> = {
  [K in keyof E['fields']]: [E['fields'][K]['schema']['Type']] extends [string] ? K : never
}[keyof E['fields']] &
  string

type NullableKey<E extends AnyEntity> = {
  [K in keyof E['fields']]: null extends E['fields'][K]['schema']['Type'] ? K : never
}[keyof E['fields']] &
  string

/** The roles of an Entity, as its Fields. */
export interface Roles {
  readonly label: EntityField<string, string, Schema.Constraint> | undefined
  readonly slug: EntityField<string, string, Schema.Constraint> | undefined
  readonly published: EntityField<string, string, Schema.Constraint> | undefined
}

const rolesKey = Metadata.key<Readonly<Record<string, string>>>('foldkit-cms/roles', {
  // Later roles add to earlier ones, and win where they name the same part.
  merge: roles => [Object.assign({}, ...roles) as Readonly<Record<string, string>>],
  summarize: roles => Object.keys(roles).join(','),
})

interface AstLike {
  readonly _tag: string
  readonly literal?: unknown
  readonly types?: ReadonlyArray<AstLike>
}

const isText = (ast: AstLike): boolean =>
  ast._tag === 'String' ||
  ast._tag === 'TemplateLiteral' ||
  (ast._tag === 'Literal' && typeof ast.literal === 'string') ||
  (ast._tag === 'Union' && (ast.types ?? []).length > 0 && (ast.types ?? []).every(isText))

const fail = (message: string): never => {
  throw new Error(`foldkit-cms: ${message}`)
}

/** An entry's id. Branded, so an entry is not opened with a post's id. */
export const EntryId = Schema.String.pipe(Schema.brand('CmsEntryId'))
export type EntryId = typeof EntryId.Type

const StateSchema = Schema.Struct({
  _tag: Schema.Literals(['New', 'Published', 'Changed', 'Unpublished', 'Archived']),
  schedule: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      overdue: Schema.Boolean,
      error: Schema.NullOr(Schema.String),
    }),
  ),
})

// A piece of content from its first keystroke to its archive: the thing an author
// works on. It exists before the content row does, and after the row is hidden.
const Entry = Entity.define(
  'CmsEntry',
  Schema.Struct({
    id: EntryId,
    /** The content type's name: `Cms.content('posts', ...)`. */
    type: Schema.String,
    /** The content row's id, once there is one. */
    targetId: Schema.NullOr(Schema.String),
    label: Schema.String.annotate({ title: 'Title' }),
    createdAt: Schema.String,
    archivedAt: Schema.NullOr(Schema.String),
    /** The number of the latest published revision: what the next publish is based on. */
    revision: Schema.NullOr(Schema.Number),
  }),
).pipe(
  // Derived by the server, with its clock, so a list can show and filter by it.
  Entity.derived({ state: Derived.make(StateSchema) }),
  // How a list or a detail shows them, with nothing said where it is declared.
  Entity.annotateMembers({
    state: Display.of(Kinds.Display.State.of({})),
    createdAt: Display.of(Kinds.Display.Moment.of({})),
    archivedAt: Display.of(Kinds.Display.Moment.of({})),
  }),
)

// The entry's one working copy: what an author has entered and not published.
const Draft = Entity.define(
  'CmsDraft',
  Schema.Struct({
    /** The entry's id: an entry has at most one draft. */
    id: EntryId,
    /** The keys of the form's value that decode, as the operation's input encodes them. */
    values: Schema.Unknown,
    /** The form's whole Model, encoded: what resumes unfinished work. */
    model: Schema.Unknown,
    /** Which form made it, and at which version, so a Model is only resumed by the form that wrote it. */
    form: Schema.String,
    updatedAt: Schema.String,
    updatedBy: Schema.NullOr(Schema.String),
    /** The revision this draft was started from; publishing over a newer one is a conflict. */
    baseRevision: Schema.NullOr(Schema.Number),
    scheduledFor: Schema.NullOr(Schema.String),
    scheduleError: Schema.NullOr(Schema.String),
  }),
)

// A published value, kept. Append-only.
const Revision = Entity.define(
  'CmsRevision',
  Schema.Struct({
    id: Schema.String,
    n: Schema.Number.annotate({ title: 'Revision' }),
    values: Schema.Unknown,
    publishedAt: Schema.String.annotate({ title: 'Published' }),
    publishedBy: Schema.NullOr(Schema.String),
  }),
).pipe(Entity.annotateMembers({ publishedAt: Display.of(Kinds.Display.Moment.of({})) }))

const Entities = Entity.relate(
  { Entry, Draft, Revision },
  {
    Entry: {
      draft: Relation.one(Draft, { optional: true }),
      revisions: Relation.many(Revision),
    },
  },
)

const entryInput = { entry: EntryId }

/**
 * What an author may ask, as Remote mutations. They are the same for every
 * content type; the entry says which type it is. The server runs each after
 * asking the application's `allow`.
 */
const Operations = {
  /**
   * Saves the working copy, valid or not. The first save of an id nobody has
   * makes the entry, so a client names something new itself (`Cms.newEntryId`) and
   * need not wait to be told what it is called. `basedOn` is the `updatedAt` this
   * save was made from: a newer one on the server is a conflict, not an overwrite.
   */
  SaveDraft: Mutation.make('CmsSaveDraft', {
    Input: {
      entry: EntryId,
      type: Schema.String,
      label: Schema.String,
      values: Schema.Unknown,
      model: Schema.Unknown,
      form: Schema.String,
      basedOn: Schema.NullOr(Schema.String),
    },
    Output: { entry: EntryId, updatedAt: Schema.String },
  }),
  DiscardDraft: Mutation.make('CmsDiscardDraft', { Input: entryInput, Output: {} }),
  /**
   * Publishes the saved draft through the content type's own mutation. `basedOn`
   * is the revision the draft was started from.
   */
  Publish: Mutation.make('CmsPublish', {
    Input: { entry: EntryId, basedOn: Schema.NullOr(Schema.Number) },
    Output: { entry: EntryId, targetId: Schema.String, revision: Schema.Number },
  }),
  Unpublish: Mutation.make('CmsUnpublish', { Input: entryInput, Output: {} }),
  Schedule: Mutation.make('CmsSchedule', {
    Input: { entry: EntryId, at: Schema.String },
    Output: {},
  }),
  Unschedule: Mutation.make('CmsUnschedule', { Input: entryInput, Output: {} }),
  Archive: Mutation.make('CmsArchive', { Input: entryInput, Output: {} }),
  Unarchive: Mutation.make('CmsUnarchive', { Input: entryInput, Output: {} }),
  /** Makes a revision's value the working copy. It publishes nothing. */
  Restore: Mutation.make('CmsRestore', {
    Input: { entry: EntryId, revision: Schema.Number },
    Output: { updatedAt: Schema.String },
  }),
}

/**
 * What an author works on: the entries of one content type, searched by what
 * they are called. `archived` chooses the put-away ones or the rest. It lists
 * entries, not content rows, so something never published is here too.
 */
const Entries = Query.make('CmsEntries', {
  Input: { type: Schema.String, search: Schema.String, archived: Schema.Boolean },
  Result: Query.connection(Entities.Entry),
})

/** A form as a content type needs it: what it was made from, and what it edits. */
interface ContentForm<E extends AnyEntity, Value> {
  readonly name: string
  readonly input: EntityInput<E, any, any>
  readonly bundle: { readonly Model: Schema.Codec<any, unknown> }
  readonly initial: unknown
  readonly engine: { readonly value: (model: any) => Value | undefined }
}

/** How a type of content is authored: the application's facts, beside the Entity's roles. */
export interface Content<
  Name extends string,
  E extends AnyEntity,
  Value,
  TargetId extends string,
  F extends ContentForm<E, Value> = ContentForm<E, Value>,
> {
  readonly name: Name
  readonly entity: E
  /** The form as it was given, so an editor of this content is typed by it. */
  readonly form: F
  readonly publish: {
    /** Makes the row, the first time. Its input is the form's value; its output names the row. */
    readonly create: MutationDescriptor<string, Value, { readonly id: TargetId }>
    /** Changes the row, every time after. Its input is the form's value and the row's id. */
    readonly update: MutationDescriptor<string, Value & { readonly id: TargetId }, any>
  }
  readonly roles: Roles
  readonly words: { readonly one: string; readonly many: string }
  /**
   * How a value of the form would look in the store: the operations an optimistic
   * publish of it would show. Declared, an author can preview what they have
   * entered in the application's own views; not declared, there is no preview.
   * `id` is the row's, or the entry's while there is no row yet.
   */
  readonly preview?:
    ((value: Partial<Value>, id: string) => ReadonlyArray<OptimisticOperation>) | undefined
}

const editor = makeEditor({ Entities, Operations })

export const Cms = {
  /**
   * A pipe step naming the members of an Entity that play a CMS part. It is
   * metadata: the Entity is the same Entity, and anything may read it with
   * `Cms.rolesOf`. A member that cannot play the part is refused here.
   */
  roles:
    <E extends AnyEntity>(roles: RoleKeys<NoInfer<E>>) =>
    (entity: E): E => {
      const given = roles as Readonly<Record<string, string | undefined>>
      const fields: Readonly<Record<string, EntityField<string, string, Schema.Constraint>>> =
        entity.fields
      for (const [role, key] of Object.entries(given)) {
        if (key === undefined) continue
        const field =
          fields[key] ??
          fail(`"${key}" is not a field of ${entity.name}, so it cannot be its ${role}`)
        const type = Schema.toType(field.schema as Schema.Top)
        if (role === 'published') {
          if (!Schema.is(type as Schema.Codec<unknown>)(null))
            fail(`"${key}" of ${entity.name} admits no null, so it cannot say a row is unpublished`)
        } else if (!isText(type.ast as unknown as AstLike)) {
          fail(`"${key}" of ${entity.name} is not text, so it cannot be its ${role}`)
        }
      }
      const named = Object.fromEntries(
        Object.entries(given).filter((entry): entry is [string, string] => entry[1] !== undefined),
      )
      return entity.pipe(Entity.annotate(rolesKey.of(named))) as E
    },

  /** The roles an Entity was given, as its Fields. A part nobody named is `undefined`. */
  rolesOf: (entity: AnyEntity): Roles => {
    const [named = {}] = rolesKey.get(entity.metadata)
    const fields: Readonly<Record<string, EntityField<string, string, Schema.Constraint>>> =
      entity.fields
    const field = (role: string) => (named[role] === undefined ? undefined : fields[named[role]])
    return { label: field('label'), slug: field('slug'), published: field('published') }
  },

  /**
   * A type of content: the Entity it is, the form that edits it, the operations
   * that publish it, and what it is called. The form is an ordinary form; the
   * operations are the application's own. It adds no fields and generates nothing.
   */
  content: <
    const Name extends string,
    E extends AnyEntity,
    Value,
    TargetId extends string = string,
    F extends ContentForm<NoInfer<E>, Value> = ContentForm<NoInfer<E>, Value>,
  >(
    name: Name,
    config: {
      readonly entity: E
      readonly form: F & ContentForm<NoInfer<E>, Value>
      readonly publish: Content<Name, E, NoInfer<Value>, TargetId>['publish']
      readonly words: { readonly one: string; readonly many: string }
      readonly preview?: Content<Name, E, NoInfer<Value>, TargetId>['preview']
    },
  ): Content<Name, E, Value, TargetId, F> => {
    if (!Entity.same(config.form.input.entity, config.entity))
      fail(
        `content "${name}" is of ${config.entity.name}, but its form edits ${config.form.input.entity.name}`,
      )
    return Object.freeze({ name, ...config, roles: Cms.rolesOf(config.entity) })
  },

  /** An id for something new, made where it is written: the first save of it makes the entry. */
  newEntryId: (): EntryId => globalThis.crypto.randomUUID() as EntryId,
  /** `Entry`, `Draft` and `Revision`: register them with Remote beside the application's own. */
  Entities,
  /** The operations, to register with Remote's `mutations`. */
  Operations,
  operations: Object.values(Operations),
  /** The worklist query, to register with Remote's `queries` and list with `Crud.list`. */
  Entries,
  /**
   * The query that finds a piece of content by its address: `<name>BySlug`, a
   * connection of one or none. It throws for a content type with no `slug` role:
   * a capability is declared, never implied.
   */
  bySlug: <Name extends string, E extends AnyEntity>(content: Content<Name, E, any, any, any>) => {
    if (content.roles.slug === undefined)
      fail(`content "${content.name}" has no slug role, so nothing is found by slug`)
    return Query.make(`${content.name}BySlug` as `${Name}BySlug`, {
      Input: { slug: Schema.String },
      Result: Query.connection(content.entity as E & { readonly name: E['name'] }),
    })
  },
  /**
   * How a server says a slug is taken, as a mutation's error: `CmsSlugTaken: <key>: ...`.
   * `slugTaken.key(message)` is the form key it names, or `undefined` for another error.
   */
  slugTaken: {
    message: (key: string, slug: string) => `CmsSlugTaken: ${key}: "${slug}" is already used`,
    key: (message: string): string | undefined => /CmsSlugTaken: ([^:]+): /.exec(message)?.[1],
  },

  /**
   * The kinds a CMS adds, and a renderer for each: `Cms.slug('title')` and
   * `Cms.dateTime()` for a form's `inputs`; `Cms.Display.State` and
   * `Cms.Display.Moment` for a list's columns; `Cms.controlRenderers()` and `Cms.displayRenderers()` to spread
   * beside the mixins' own.
   */
  ...Kinds,

  /**
   * The authoring editor of a content type: its form, the entry, and the draft
   * that keeps what the author has entered. Saving is automatic and is not
   * publishing; publishing submits the form.
   */
  editor,

  /** The state of an entry, from what is known of it and a clock. */
  state: (facts: Facts, now: Date): State => state(facts, now),
  /** The transitions an entry offers now, before anyone asks who is asking. */
  offers: (
    facts: Facts,
    now: Date,
    content: { readonly roles: Roles },
  ): ReadonlyArray<Transition> =>
    offers(facts, now, { unpublishes: content.roles.published !== undefined }),
}

export type {
  EditorContent,
  EditorDomain,
  EditorForm,
  EditorModel,
  EditorOut,
  EditorStatus,
  Resumed,
} from './editor.js'
export type { ControlContext, DisplayContext, StateWords } from './kinds.js'
