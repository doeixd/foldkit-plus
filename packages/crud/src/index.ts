/**
 * `foldkit-crud` — management screens assembled from parts an application
 * already has.
 *
 * An editor joins a `foldkit-form` form, the Remote mutation its value feeds,
 * and the Entity they share: it loads what the form writes, shows it, turns a
 * valid submit into the mutation, and says how that went. Everything it makes is
 * ordinary Foldkit: a Bundle, an ActiveSurface, Update Steps. Nothing is
 * generated from an Entity alone; each capability is declared.
 */
import { Effect, Match, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Entity,
  SelectionPageTypeId,
  Words,
  type AnyEntity,
  type EntityInput,
  type EntityMember,
  type InputMember,
  type Selection,
  type IdOf,
  type SelectionPage,
} from 'foldkit-entity'
import { Form, Input, type FormControl, type Submitted } from 'foldkit-form'
import { Display, type DisplayColumn } from './display.js'
import { screen } from './screen.js'
import {
  Refusal,
  RemoteData,
  type MutationDescriptor,
  type Page,
  type QueryDescriptor,
  type MutationStatus,
  type RemoteClient,
  type RemoteError,
  type RemoteMessage,
} from 'foldkit-remote'
import { Projection, type ActiveSurface, type ModelRef } from 'foldkit-surface'
import { define as defineCommand, type Command } from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'
import type * as Update from 'foldkit/update'

/** The parts of a `Form.make` result an editor wraps. */
export interface EditableForm<
  Name extends string,
  FormModel,
  FormMessage,
  Value,
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
  Members,
  R = never,
> {
  readonly bundle: {
    readonly name: Name
    readonly Model: Schema.Codec<FormModel, unknown>
    readonly Message: Schema.Codec<FormMessage, unknown>
    readonly update: (
      model: FormModel,
      message: FormMessage,
      args: void,
    ) => Update.ReturnWithOutMessage<FormModel, FormMessage, Submitted<Value>, R>
  }
  readonly input: EntityInput<E, Fields, Members>
  readonly initial: FormModel
  readonly fill: (model: FormModel, values: Partial<Value>) => { readonly model: FormModel }
  readonly authoredChanged: (before: FormModel, after: FormModel) => boolean
  readonly controls: ReadonlyArray<FormControl>
  readonly Message: {
    // Method syntax: the form's own takes only its keys, which the editor checks first.
    Refused(fields: {
      readonly key: string
      readonly error: string
      readonly value: unknown
    }): FormMessage
  }
}

/**
 * An editor's slice of the parent Model. `target` is the id being edited, or
 * `null` for a new one; `filled` is whether the loaded value has been shown;
 * `requestId` is the save in progress or last settled.
 */
/**
 * Which members of a row its reader may not set, read from members loaded
 * beside the form's: what `Crud.editor`'s `locks` takes. `foldkit-guard`'s
 * `May.locks(Todo)` is one, from the server's `may`.
 */
export interface Locks {
  /** The members to load beside the form's, by key: `{ may: true }`. */
  readonly select: Readonly<Record<string, true>>
  /** Whether `member` of the loaded row may not be set by its reader. */
  readonly locked: (row: Readonly<Record<string, unknown>>, member: string) => boolean
}

export interface EditorModel<FormModel> {
  readonly form: FormModel
  readonly mode: 'closed' | 'new' | 'edit'
  readonly target: string | null
  readonly filled: boolean
  readonly requestId: string | null
  /** Whether the author changed the form since its last save was sent. */
  readonly edited: boolean
  /** What the last save sent, for the form to take once it lands. */
  readonly sent: Option.Option<Readonly<Record<string, unknown>>>
  /** The save whose answer the form already took, so it is taken once. */
  readonly settledFor: Option.Option<string>
  /** The save whose refusal of a field the form already shows, so it is shown once. */
  readonly refusedFor: Option.Option<string>
  /**
   * The input values the row held as the form knows it: filled from it, and
   * moved on by each save of this editor's. A save compares to it, to send
   * only what changed.
   */
  readonly filledWith: Option.Option<Readonly<Record<string, unknown>>>
}

/**
 * A remover's slice of the parent Model: the id it was asked to delete and is
 * waiting on a yes for, and the delete in progress or last settled.
 */
export interface RemoverModel {
  readonly target: string | null
  readonly requestId: string | null
}

/** A remover's out Message: the user said yes to deleting `id`. */
export interface ConfirmedRemoval {
  readonly _tag: 'Confirmed'
  readonly id: string
}

export type RemoverStatus =
  | 'Idle'
  /** Asked to delete an id, and waiting for a yes or a no. */
  | 'Confirming'
  | 'Deleting'
  | 'Deleted'
  | 'DeleteFailed'

export type EditorStatus =
  | 'Closed'
  /** Editing an id whose current values have not arrived. */
  | 'Loading'
  | 'NotFound'
  | 'LoadFailed'
  | 'Editing'
  | 'Saving'
  | 'Saved'
  | 'SaveFailed'
  /** The server refused the save with `Refusal.conflict`: the row moved on since it was read. */
  | 'Conflict'
  /**
   * Someone else saved the row since it was read: its revision moved past the
   * one the form holds. The draft is kept; a save of it would be a conflict.
   */
  | 'Moved'

/** The parts of a bound Remote domain an editor uses. */
export interface DomainLike<Root> {
  // Method syntax: the descriptors are checked where the editor is made, not here.
  mutate(
    model: Root,
    mutation: any,
    input: any,
    options?: { readonly keys?: ReadonlyArray<string> | undefined },
  ): {
    readonly model: Root
    readonly requestId: string
    readonly command: Command<RemoteMessage, never, RemoteClient>
  }
  get(selection: any, id: string): Projection<Root, RemoteData<any>>
  query(
    query: any,
    input: any,
    options: any,
  ): Projection<Root, RemoteData<Page<any>>> & { readonly ref: { readonly identity: string } }
  more(model: Root, projection: any): Option.Option<Root>
  refresh(model: Root, target: any): Root
  mutation(model: Root, requestId: string): MutationStatus
  refusal(model: Root, requestId: string, mutation: any): Option.Option<unknown>
  /** `Data.active`: a read of the domain as an active Surface of its application. */
  active<Value>(
    name: string,
    projectionOf: (model: Root) => Option.Option<Projection<Root, Value>>,
  ): ActiveSurface<Root, Value>
}

type Step<Root> = Update.Step<Root, RemoteMessage, RemoteClient>

/** One thing a relation picker offers. */
export interface Choice {
  readonly value: string
  readonly label: string
}

/**
 * One column of a list, or one line of a detail: a member the Selection reads,
 * with its words and its `Display`.
 */
export type ListColumn<Key extends string = string> = DisplayColumn<Key>

/** What a read holds: its value, or the last one read when a refresh failed. */
const heldValue = <A>(read: RemoteData<A>): Option.Option<A> =>
  RemoteData.match(read, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: Option.some,
    Refreshing: Option.some,
    Failed: (_, previous) => previous,
    NotFound: () => Option.none(),
  })

const columnLabel = (key: string, member: EntityMember): string =>
  Option.getOrElse(
    member._tag === 'Relation' ? Option.none() : Words.of(member.schema as Schema.Top).title,
    () => Form.labelOf(member) ?? key,
  )

type AnySelection = Selection<string, unknown, Schema.Constraint>

/** The selected members in the Selection's order, each with its label and its Display. */
const columnsOf = <Members>(
  selection: Selection<string, Members, Schema.Constraint>,
): ReadonlyArray<ListColumn<keyof Members & string>> => {
  const members: Readonly<Record<string, EntityMember>> = selection.entity.members
  const selected = selection.members as Readonly<
    Record<string, true | AnySelection | SelectionPage<string, Schema.Constraint>>
  >
  return Object.keys(selected).map(key => {
    const member = members[key]!
    const how = selected[key]!
    // A relation read through a Selection shows the target's own members.
    const nested =
      how === true || member._tag !== 'Relation'
        ? undefined
        : SelectionPageTypeId in how
          ? { shape: 'page' as const, columns: columnsOf(how.selection) }
          : {
              shape: member.cardinality === 'many' ? ('many' as const) : ('one' as const),
              columns: columnsOf(how),
            }
    return {
      key: key as keyof Members & string,
      label: columnLabel(key, member),
      member,
      display: Display.resolve(member, nested),
    }
  })
}

const RemoverMessage = defineMessageUnion({
  Confirmed: {},
  Cancelled: {},
  /** Focus went back to what asked, after a no took the question away. */
  CompletedFocus: {},
})
type RemoverMessage = typeof RemoverMessage.Type

const idle: RemoverModel = { target: null, requestId: null }

const FocusAsker = defineCommand('Crud.remover.Focus', {
  args: { selector: Schema.String },
  messages: [RemoverMessage.CompletedFocus],
  // What asked may be gone by now, and nothing to focus is nothing to do.
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(RemoverMessage.CompletedFocus())),
})

export const Crud = {
  /**
   * One Entity read through a Selection, for a page that shows it. Like a list
   * it holds no state: the value is Remote's and the id is the application's.
   */
  detail: <const Name extends string, EntityName extends string, Members, Row>(
    name: Name,
    config: {
      readonly selection: Selection<EntityName, Members, Schema.Constraint & { readonly Type: Row }>
    },
  ) => ({
    name,
    /** The selected members in the Selection's order, each with its label. */
    fields: columnsOf(config.selection),
    /** Type-only: the value shown, for a view to be typed by. Never read. */
    Value: undefined as unknown as Row,

    /** The detail where it lives: `id` is the one shown, none while none is. */
    at: <Root>(where: {
      readonly data: DomainLike<Root>
      readonly id: (root: Root) => Option.Option<string>
    }) => {
      const projectionOf = (root: Root) =>
        Option.map(where.id(root), id => where.data.get(config.selection, id))
      return {
        /** For `Data.subscriptions`: the value is fetched and retained while an id is shown. */
        active: where.data.active(name, projectionOf),
        value: (root: Root): RemoteData<Row> =>
          Option.match(projectionOf(root), {
            onNone: () => ({ _tag: 'Initial' }),
            onSome: projection => projection.read(root),
          }),
        /**
         * Asks for the value again: `Data.refresh` over this detail, for a retry
         * button. A failed read is not retried on its own. Unchanged while no id
         * is shown.
         */
        refresh: (root: Root): Root =>
          Option.match(projectionOf(root), {
            onNone: () => root,
            onSome: projection => where.data.refresh(root, projection),
          }),
      }
    },
  }),

  /**
   * A screen's Messages (`OpenedPost`, `CreatedPost`, `ClosedPost`,
   * `AskedToRemovePost`) and an `update` that answers them through the editor's
   * and the remover's placements, for a page that places both itself.
   */
  screen,

  /**
   * Deleting through one mutation, with a yes in between: asked, confirmed,
   * deleted. What the mutation's input is for an id is `input`'s to say, and the
   * id it names there (`(id: PostId) => ...`) is the id `ask` takes.
   */
  remover: <
    const Name extends string,
    Input,
    Id extends string = string,
    const Key extends keyof Input = never,
  >(
    name: Name,
    config:
      | {
          readonly mutation: MutationDescriptor<string, Input, any>
          readonly input: (id: Id) => Input
        }
      | {
          readonly mutation: MutationDescriptor<string, Input, any>
          /**
           * The key of the mutation's input that holds the id, when that is all the
           * input is: `id: 'id'` for `{ id }`. The id's type is that key's.
           */
          readonly id: Key & (Input extends Readonly<Record<Key, string>> ? Key : never)
        },
    options: {
      /**
       * Where focus goes after a no takes the question away: the selector of the
       * button that asked (`'#delete'`), or one for the id asked about, for a
       * list with a button per row (`id => '#delete-' + id`). Without it focus
       * falls to the page.
       */
      readonly returnFocus?: string | ((id: string) => string) | undefined
    } = {},
  ) => {
    type AskedId = [Key] extends [never] ? Id : Input[Key] & string
    const inputFor = (id: string): Input =>
      'input' in config ? config.input(id as Id) : ({ [config.id]: id } as Input)
    const bundle = Bundle.make(name, {
      Model: Schema.Struct({
        target: Schema.NullOr(Schema.String),
        requestId: Schema.NullOr(Schema.String),
      }) as unknown as Schema.Codec<RemoverModel, unknown>,
      Message: RemoverMessage,
      init: () => ({ model: idle }),
      update: (model: RemoverModel, message: RemoverMessage) =>
        RemoverMessage.match<
          Update.ReturnWithOutMessage<RemoverModel, RemoverMessage, ConfirmedRemoval, never>
        >(message, {
          Cancelled: () => {
            const { returnFocus } = options
            // A no to no question took nothing away: focus stays where it is.
            if (model.target === null || returnFocus === undefined) return { model: idle }
            const selector =
              typeof returnFocus === 'string' ? returnFocus : returnFocus(model.target)
            return { model: idle, commands: [FocusAsker({ selector })] }
          },
          Confirmed: () =>
            model.target === null
              ? { model: idle }
              : { model, outMessage: { _tag: 'Confirmed', id: model.target } as ConfirmedRemoval },
          CompletedFocus: () => ({ model }),
        }),
      helpers: {
        /** Asks whether to delete `id`. Nothing is deleted until `Confirmed`. */
        ask: (_: RemoverModel, id: AskedId) => ({ model: { target: id, requestId: null } }),
        dismiss: () => ({ model: idle }),
      },
    })

    return {
      bundle,
      /** The remover's Messages, for the yes and the no of a confirmation. */
      Message: RemoverMessage,

      at: <Root>(where: {
        readonly data: DomainLike<Root>
        readonly model: ModelRef<Root, RemoverModel>
      }) => {
        const { data, model: slice } = where
        const outcome = (root: Root): MutationStatus => {
          const { requestId } = slice.get(root)
          return requestId === null ? { _tag: 'Unknown' } : data.mutation(root, requestId)
        }
        return {
          /** For the placement: a yes becomes the mutation, and its request is remembered. */
          onOut:
            (confirmed: ConfirmedRemoval): Step<Root> =>
            root => {
              const started = data.mutate(root, config.mutation, inputFor(confirmed.id))
              return {
                model: slice.set(started.model, {
                  target: confirmed.id,
                  requestId: started.requestId,
                }),
                commands: [started.command],
              }
            },

          /** The id being asked about or deleted, for the words of a confirmation. */
          target: (root: Root): AskedId | null => slice.get(root).target as AskedId | null,

          status: (root: Root): RemoverStatus => {
            const { target } = slice.get(root)
            const deleting = outcome(root)
            return deleting._tag === 'Pending'
              ? 'Deleting'
              : deleting._tag === 'Applied'
                ? 'Deleted'
                : deleting._tag === 'Failed'
                  ? 'DeleteFailed'
                  : target === null
                    ? 'Idle'
                    : 'Confirming'
          },

          /** Why the last delete failed, while `status` is `DeleteFailed`. */
          error: (root: Root): RemoteError | undefined => {
            const deleting = outcome(root)
            return deleting._tag === 'Failed' ? deleting.error : undefined
          },
        }
      },
    }
  },

  /**
   * A list over one query: which rows to show is the query's, what to show of
   * each is the Selection's. The pages live in Remote; the list holds no state.
   */
  list: <
    const Name extends string,
    EntityName extends string,
    Members,
    S extends Schema.Constraint,
    Input,
  >(
    name: Name,
    config: {
      readonly query: QueryDescriptor<string, Input, any>
      // The row is the Selection's own value, so it is typed with or without a `choice`.
      readonly selection: Selection<EntityName, Members, S>
      /** How many rows a page holds. Default 25. */
      readonly pageSize?: number
      /** Watch the list live while it is shown (`Data.query`'s `live`). */
      readonly live?: boolean
      /**
       * How a row reads as a choice in a relation picker: its id, and the words
       * that identify it to a person. Give it to a list that feeds pickers.
       */
      readonly choice?: {
        readonly value: (row: S['Type']) => string
        readonly label: (row: S['Type']) => string
      }
    },
  ) => {
    const { query, selection, pageSize = 25, live = false, choice } = config
    const columns = columnsOf(selection)

    return {
      name,
      /** The selected members in the Selection's order, each with its label. */
      columns,
      /** Type-only: a row, for a view to be typed by. Never read. */
      Row: undefined as unknown as S['Type'],

      /**
       * The list where it lives. `input` is the query's input as the Model has
       * it (filters, a search term), or `undefined` while the list is not shown.
       */
      at: <Root>(where: {
        readonly data: DomainLike<Root>
        /** The list's input from the Model; none while the list is not shown. */
        readonly input: (root: Root) => Option.Option<Input>
      }) => {
        const { data, input } = where
        const projectionOf = (root: Root) =>
          Option.map(input(root), value =>
            data.query(query, value, { select: selection, first: pageSize, live }),
          )
        const page = (root: Root): RemoteData<Page<S['Type']>> =>
          Option.match(projectionOf(root), {
            onNone: () => ({ _tag: 'Initial' }),
            onSome: projection => projection.read(root),
          })

        const active = data.active(name, projectionOf)

        return {
          /** For `Data.subscriptions`: the page and its rows are fetched and retained while shown. */
          active,

          page,

          /**
           * The connection the list reads while it is shown, for a write's
           * optimistic insert or remove (`ConnectionChange.prepend(list, ref)`):
           * the list's own key, so a change cannot name one rebuilt from its
           * input that nothing reads. None while the list is not shown.
           */
          connection: (root: Root): Option.Option<{ readonly identity: string }> =>
            Option.map(projectionOf(root), projection => projection.ref),

          /**
           * "Load more": the Model with the list showing one page more, for the
           * read entry to fetch; none when it shows every row there is.
           */
          more: (root: Root): Option.Option<Root> =>
            Option.flatMap(projectionOf(root), projection => data.more(root, projection)),

          /** Whether the page read says more rows follow it: what a picker's "more" offers. */
          hasMore: (root: Root): boolean => {
            const read = page(root)
            return (read._tag === 'Ready' || read._tag === 'Refreshing') && read.value.hasNext
          },

          /**
           * Asks for the list again: `Data.refresh` over its page and rows, for a
           * retry button. A failed read is not retried on its own. Unchanged while
           * the list is not shown.
           */
          refresh: (root: Root): Root =>
            Option.match(projectionOf(root), {
              onNone: () => root,
              onSome: projection => data.refresh(root, projection),
            }),

          name,
          /** Whose requirement the list is, for anything that requires beside it. */
          owner: active.owner,
          /**
           * One of the list's Entity through the list's Selection, by id, whether or
           * not the query finds it now: what a picker reads to name what is chosen.
           */
          row: (id: string): Projection<Root, RemoteData<any>> => data.get(selection, id),
          /** The Entity the rows are of, which is how a picker finds the list for its target. */
          entity: selection.entity as AnyEntity,
          /** Whether the list was given a `choice`, so its rows can be a picker's choices. */
          offersChoices: choice !== undefined,

          /**
           * The loaded rows as a picker's choices, read through `choice`; after a
           * failed refresh, the rows last read, as the list still shows them. Listing a
           * relation's target is this query, which the application chose and the
           * server authorizes; nothing is read because a relation exists.
           */
          choices: (root: Root): ReadonlyArray<Choice> => {
            if (choice === undefined)
              throw new Error(`Crud list "${name}": give it a "choice" to use its rows in a picker`)
            return Option.match(heldValue(page(root)), {
              onNone: () => [],
              onSome: ({ items }) =>
                items.map(row => ({ value: choice.value(row), label: choice.label(row) })),
            })
          },

          /** That row as a choice, once it is read, or as last read when a refresh failed. */
          choiceOf: (root: Root, id: string): Choice | undefined => {
            if (choice === undefined) return undefined
            return Option.match(heldValue(data.get(selection, id).read(root)), {
              onNone: () => undefined,
              onSome: row => ({ value: choice.value(row), label: choice.label(row) }),
            })
          },
        }
      },
    }
  },

  /**
   * A form's Submodel view as the view of the editor that wraps it, for
   * `Bundle.withView`: the editor's Messages are the form's, and its Model holds
   * the form's under `form`.
   *
   * ```ts
   * Editor.bundle.pipe(Bundle.withView(Crud.editorView(FormView.submodel(form, view))))
   * ```
   */
  editorView: <FormModel, Message, ViewInputs>(
    view: Submodel.View<FormModel, Message, ViewInputs>,
  ): Submodel.View<EditorModel<FormModel>, Message, ViewInputs> =>
    Submodel.defineView<EditorModel<FormModel>, Message, ViewInputs>(((
      model: EditorModel<FormModel>,
      inputs: ViewInputs,
      h: HtmlBuilder<Message>,
    ): Html =>
      (view as (model: FormModel, inputs: ViewInputs, h: HtmlBuilder<Message>) => Html)(
        model.form,
        inputs,
        h,
      )) as never),

  /**
   * The choices of every relation picker in a form, from the lists of their
   * targets: `foldkit-mixins-form`'s `options`, keyed by the form's keys. A
   * picker whose target no list here is over is a wiring mistake, reported now.
   *
   * With `chosen`, the form's Model as the page has it, what a picker already
   * holds stays among its choices when the list no longer finds it (a search
   * narrowed it, or it is on a later page), and `active` requires those rows so
   * their words are there. Give `chosen` to any form whose pickers search.
   */
  options: <Key extends string, Root, FormModel = never>(
    form: {
      readonly controls: ReadonlyArray<FormControl<Key>>
      readonly field?: (model: FormModel, key: never) => { readonly value: unknown }
    },
    lists: ReadonlyArray<{
      readonly name: string
      readonly entity: AnyEntity
      readonly offersChoices: boolean
      readonly owner: object
      readonly choices: (root: Root) => ReadonlyArray<Choice>
      readonly row: (id: string) => Projection<Root, RemoteData<any>>
      readonly choiceOf: (root: Root, id: string) => Choice | undefined
      readonly more: (root: Root) => Option.Option<Root>
      readonly hasMore: (root: Root) => boolean
    }>,
    options: { readonly chosen?: (root: Root) => FormModel | undefined } = {},
  ) => {
    const pickers = form.controls.flatMap(({ key, control }) => {
      if (!Input.RelationOne.is(control) && !Input.RelationMany.is(control)) return []
      const { target } = control.data
      const list = lists.find(candidate => Entity.same(candidate.entity, target))
      if (list === undefined)
        throw new Error(
          `Crud.options: "${key}" picks a ${target.name}, and no list given is over ${target.name}`,
        )
      if (!list.offersChoices)
        throw new Error(
          `Crud.options: "${key}" would pick from list "${list.name}", which has no "choice"`,
        )
      return [[key, list] as const]
    })

    /** Each picker with the ids it holds now: the draft of a `one`, or of a `many`. */
    const held = (
      root: Root,
    ): ReadonlyArray<readonly [Key, (typeof lists)[number], ReadonlyArray<string>]> => {
      const model = options.chosen?.(root)
      const field = form.field as
        | ((model: FormModel, key: string) => { readonly value: unknown })
        | undefined
      return pickers.map(([key, list]) => {
        if (model === undefined || field === undefined) return [key, list, []]
        const draft = field(model, key).value
        const ids = Array.isArray(draft) ? draft : typeof draft === 'string' ? [draft] : []
        return [key, list, ids.filter((id): id is string => typeof id === 'string' && id !== '')]
      })
    }

    const choices = (root: Root): { readonly [K in Key]?: ReadonlyArray<Choice> } =>
      Object.fromEntries(
        held(root).map(([key, list, ids]) => {
          const listed = list.choices(root)
          if (ids.length === 0) return [key, listed]
          const shown = new Set(listed.map(item => item.value))
          const missing = ids.flatMap(id => (shown.has(id) ? [] : (list.choiceOf(root, id) ?? [])))
          // What is chosen leads, so it is in reach whatever the list shows.
          return [key, [...missing, ...listed]]
        }),
      ) as unknown as { readonly [K in Key]?: ReadonlyArray<Choice> }

    const [first] = lists
    if (first === undefined)
      throw new Error(
        'Crud.options: give it the lists its pickers pick from; with none, it has nothing to read',
      )
    const listOf = new Map<string, (typeof lists)[number]>(pickers)
    return Object.assign(choices, {
      /** For `FormView`'s `more`: the pickers whose list has more rows than it shows. */
      more: (root: Root): { readonly [K in Key]?: boolean } =>
        Object.fromEntries(
          pickers.flatMap(([key, list]) => (list.hasMore(root) ? [[key, true]] : [])),
        ) as { readonly [K in Key]?: boolean },
      /**
       * The page with one more page of `key`'s list, for the form's `AskedForMore`
       * (`Crud.screen` answers it given these pickers); the page as it is for a key
       * that is no picker here, or a list that shows every row.
       */
      ask: (root: Root, key: Key): Root =>
        Option.getOrElse(
          Option.flatMap(Option.fromNullishOr(listOf.get(key)), list => list.more(root)),
          () => root,
        ),
      /** For `Data.subscriptions`: what the pickers hold is read, so it can be named. */
      active: {
        name: `${pickers.map(([key]) => key).join('+')} chosen`,
        owner: first.owner,
        projectionOf: (root: Root) => {
          // Keyed by key and id as JSON: both may hold a colon, so `${key}:${id}` collides.
          const rows = held(root).flatMap(([key, list, ids]) =>
            ids.map(id => [JSON.stringify([key, id]), list.row(id)] as const),
          )
          return rows.length === 0
            ? Option.none()
            : Option.some(Projection.struct(Object.fromEntries(rows)))
        },
        messages: [],
      } satisfies ActiveSurface<Root>,
    })
  },

  /**
   * What the pieces on a page require of Remote, by the names given: a placed
   * editor, list, or detail, or the pickers from `Crud.options`. It is each one's
   * `active`, gathered, so handing the pieces over is enough and none is left out:
   *
   * ```ts
   * Data.wiring(Crud.actives({ posts: Posts, authors: Authors, editor: PostEditor, pickers }))
   * ```
   */
  actives: <const Pieces extends Readonly<Record<string, { readonly active: unknown }>>>(
    pieces: Pieces,
  ): { readonly [K in keyof Pieces]: Pieces[K]['active'] } =>
    Object.fromEntries(Object.entries(pieces).map(([name, piece]) => [name, piece.active])) as {
      readonly [K in keyof Pieces]: Pieces[K]['active']
    },

  /**
   * An editor for one form and the mutation its value feeds. The form's value
   * must be the mutation's input, which is what declaring the input once and
   * giving it to both guarantees.
   */
  editor: <
    const Name extends string,
    FormName extends string,
    FormModel,
    FormMessage extends { readonly _tag: string },
    Value,
    E extends AnyEntity,
    Fields extends Schema.Struct.Fields,
    Members,
    R = never,
  >(
    name: Name,
    config: {
      readonly form: EditableForm<FormName, FormModel, FormMessage, Value, E, Fields, Members, R>
      readonly mutation: MutationDescriptor<string, Value, any>
      /**
       * Which of the form's keys the row being edited does not let its reader
       * set, from members loaded beside the form's: `foldkit-guard`'s
       * `May.locks(Todo)`. Read with `locked`.
       */
      readonly locks?: Locks | undefined
    },
  ) => {
    type Model = EditorModel<FormModel>
    const { form, mutation, locks } = config
    // How each input key's value is compared, built once from its own schema.
    const sameValue: Readonly<Record<string, (left: unknown, right: unknown) => boolean>> =
      Object.fromEntries(
        Object.entries(form.input.schema.fields).map(([key, schema]) => [
          key,
          Schema.toEquivalence(schema as Schema.Codec<unknown, unknown>),
        ]),
      )
    // The input key holding the revision a declared write expects, when it expects one.
    const expectKey = mutation.write?.expect?.key
    // The keys a refusal can name: a nested key holds rows, not a draft to mark.
    const draftKeys = new Set(
      form.controls.filter(entry => !Input.Nested.is(entry.control)).map(entry => entry.key),
    )
    // The form's key that sets each field, for an invariant's path, which names fields.
    const keyOfField = new Map<string, string>(
      Object.entries(form.input.members as Readonly<Record<string, InputMember>>).flatMap(
        ([key, member]) => {
          if (member._tag !== 'Field' || !draftKeys.has(key)) return []
          return [[member.key, key] as const]
        },
      ),
    )
    /** The keys a refusal names among the form's, each with what to say beside it. */
    const namedBy = (
      refusal: unknown,
    ): ReadonlyArray<{ readonly key: string; readonly error: string }> => {
      if (Refusal.isField(refusal)) {
        return draftKeys.has(refusal.key)
          ? [{ key: refusal.key, error: String(refusal.reason) }]
          : []
      }
      if (Refusal.isInvalid(refusal)) {
        return refusal.path.flatMap(field =>
          Option.toArray(Option.fromUndefinedOr(keyOfField.get(field))).map(key => ({
            key,
            error: refusal.message,
          })),
        )
      }
      return []
    }

    const closed: Model = {
      form: form.initial,
      mode: 'closed',
      target: null,
      filled: false,
      requestId: null,
      edited: false,
      sent: Option.none(),
      settledFor: Option.none(),
      refusedFor: Option.none(),
      filledWith: Option.none(),
    }
    const Model = Schema.Struct({
      form: form.bundle.Model,
      mode: Schema.Literals(['closed', 'new', 'edit']),
      target: Schema.NullOr(Schema.String),
      filled: Schema.Boolean,
      requestId: Schema.NullOr(Schema.String),
      edited: Schema.Boolean,
      sent: Schema.OptionFromNullOr(Schema.Record(Schema.String, Schema.Unknown)),
      settledFor: Schema.OptionFromNullOr(Schema.String),
      refusedFor: Schema.OptionFromNullOr(Schema.String),
      filledWith: Schema.OptionFromNullOr(Schema.Record(Schema.String, Schema.Unknown)),
    }) as unknown as Schema.Codec<Model, unknown>

    // The editor's Messages are the form's own: it adds state around the form,
    // not a second vocabulary.
    const bundle = Bundle.make(name, {
      Model,
      Message: form.bundle.Message,
      init: () => ({ model: closed }),
      update: (model: Model, message: FormMessage) => {
        const next = form.bundle.update(model.form, message, undefined)
        // An edit after a save starts a new round: the last save no longer
        // describes the form, though its answer is still the form's to take.
        // Any authored change counts, not only `Changed`: a row added or a
        // Bundle-backed control's edit is one too.
        const edited = model.edited || form.authoredChanged(model.form, next.model)
        const unchanged = next.model === model.form && edited === model.edited
        // The form's Commands are the editor's: a check the form started has to run.
        const step = {
          model: unchanged ? model : { ...model, form: next.model, edited },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
        return next.outMessage === undefined ? step : { ...step, outMessage: next.outMessage }
      },
      helpers: {
        /** Edits `id`: the form is emptied, and filled once the current values arrive. */
        open: (_: Model, id: IdOf<E>) => ({
          model: { ...closed, mode: 'edit' as const, target: id },
        }),
        /** A blank form for a new one: nothing to load. */
        blank: () => ({ model: { ...closed, mode: 'new' as const, filled: true } }),
        close: () => ({ model: closed }),
      },
    })

    const written = Entity.selectFor(form.input)
    type Row = (typeof written)['schema']['Type']
    // What is loaded: what the form writes, and what `locks` reads beside it,
    // which the form never fills from.
    const current: typeof written =
      locks === undefined
        ? written
        : (Entity.select(form.input.entity, {
            ...(written.members as Readonly<Record<string, unknown>>),
            ...locks.select,
          } as never) as typeof written)
    /** The member each form key writes: a field's own key, or the relation it points. */
    const writes: ReadonlyArray<readonly [keyof Fields & string, string]> = Object.entries(
      form.input.members as Readonly<Record<string, InputMember | undefined>>,
    ).flatMap(([key, member]) =>
      member === undefined
        ? []
        : Match.valueTags(member, {
            Field: ({ key: written }) => [[key as keyof Fields & string, written] as const],
            RelationInput: ({ relation }) => [
              [key as keyof Fields & string, relation.key] as const,
            ],
            NestedInput: () => [],
            Unmapped: () => [],
          }),
    )

    return {
      bundle,
      /** What the editor loads before it shows the form: every member the form writes. */
      selection: current,

      /**
       * The editor where it lives: `model` is its slice of the parent Model (the
       * field it was declared at), and `data` the Remote domain that registers the
       * mutation and the Entity.
       */
      at: <Root>(where: {
        readonly data: DomainLike<Root>
        readonly model: ModelRef<Root, Model>
      }) => {
        const { data, model: slice } = where
        const loaded = (root: Root): RemoteData<any> | undefined => {
          const { mode, target } = slice.get(root)
          return mode === 'edit' && target !== null
            ? data.get(current, target).read(root)
            : undefined
        }

        /**
         * Shows the loaded value once, the first time it is there. Later refreshes
         * leave the drafts alone. A value whose latest refresh failed is still the
         * last one known good, so it fills the form too: `status` goes on saying
         * `Editing`, and the failure is the read's to show.
         */
        /**
         * A save the server refused for the form's keys shows on those keys,
         * once per save: `Refusal.field`'s reason, as text, or `Refusal.invalid`'s
         * message beside each key its path names. Any other refusal, and one
         * naming no key of the form, is the status's to say.
         */
        const refused = (root: Root): Root => {
          const editor = slice.get(root)
          const { requestId } = editor
          if (requestId === null || Option.contains(editor.refusedFor, requestId)) return root
          const named = Option.match(refusalOf(root), { onNone: () => [], onSome: namedBy })
          if (named.length === 0) return root
          // What the save sent for each key: the form drops a refusal of a key changed since.
          const sent: Readonly<Record<string, unknown>> = Option.getOrElse(editor.sent, () => ({}))
          return slice.set(root, {
            ...editor,
            form: named.reduce(
              (shown, { key, error }) =>
                form.bundle.update(
                  shown,
                  form.Message.Refused({
                    key,
                    error,
                    value: Object.hasOwn(sent, key) ? sent[key] : undefined,
                  }),
                  undefined,
                ).model,
              editor.form,
            ),
            refusedFor: Option.some(requestId),
          })
        }

        /** The value loaded, or the last one known good when a refresh failed. */
        const known = (root: Root): Option.Option<any> => {
          const read = loaded(root)
          return read === undefined ? Option.none() : heldValue(read)
        }

        const filledOf = (root: Root): Root => {
          const editor = slice.get(root)
          if (editor.filled) return root
          const shown = known(root)
          if (Option.isNone(shown)) return root
          const value = shown.value
          const values = Entity.valuesFor(form.input, value) as Partial<Value>
          return slice.set(root, {
            ...editor,
            form: form.fill(editor.form, values).model,
            filled: true,
            filledWith: Option.some(values),
          })
        }

        /**
         * The input keys a save changes from what the form was filled with, by
         * each key's own schema: none filled (something new) is every key, so
         * none are named.
         */
        const changedKeys = (editor: Model, value: Value): ReadonlyArray<string> | undefined => {
          // A submitted value is the form's decoded struct, so it reads by key.
          const submitted = value as Readonly<Record<string, unknown>>
          return Option.match(editor.filledWith, {
            onNone: () => undefined,
            onSome: filled =>
              Object.keys(submitted).filter(
                key => !Object.hasOwn(filled, key) || !sameValue[key]!(filled[key], submitted[key]),
              ),
          })
        }

        /** The revision the row is at now, as the form's `expect` key holds it. */
        const currentRevision = (root: Root): Option.Option<unknown> => {
          const read = loaded(root)
          if (expectKey === undefined || read === undefined) return Option.none()
          if (read._tag !== 'Ready' && read._tag !== 'Refreshing') return Option.none()
          const values = Entity.valuesFor(form.input, read.value) as Readonly<
            Record<string, unknown>
          >
          return Object.hasOwn(values, expectKey) ? Option.some(values[expectKey]) : Option.none()
        }
        /** Whether the row is at another revision than the one the form was filled with. */
        const moved = (root: Root): boolean => {
          const { filledWith } = slice.get(root)
          return (
            expectKey !== undefined &&
            Option.isSome(filledWith) &&
            Option.exists(
              currentRevision(root),
              revision => !sameValue[expectKey]!(filledWith.value[expectKey], revision),
            )
          )
        }

        /**
         * Once this editor's save lands, the form takes its answer, once: what
         * it sent is now what the row holds as the form knows it, and the
         * revision is the one it moved the row to, or its next save would
         * conflict with itself. A revision moved after that is another's, and
         * reads as `Moved`. A create's form starts blank again, its values now
         * the row's; one the author went on typing in is a new one's draft.
         */
        const settled = (root: Root): Root => {
          const editor = slice.get(root)
          const { requestId } = editor
          if (requestId === null || Option.contains(editor.settledFor, requestId)) return root
          if (saveOf(root)._tag !== 'Applied') return root
          const settledFor = Option.some(requestId)
          if (editor.mode === 'new') {
            return slice.set(root, {
              ...editor,
              settledFor,
              ...(editor.edited ? {} : { form: form.initial }),
            })
          }
          const revision = expectKey === undefined ? Option.none() : currentRevision(root)
          const filledWith = Option.some({
            ...Option.getOrElse(editor.filledWith, () => ({})),
            ...Option.getOrElse(editor.sent, () => ({})),
            ...Option.match(revision, {
              onNone: () => ({}),
              onSome: value => ({ [expectKey!]: value }),
            }),
          })
          return slice.set(root, {
            ...editor,
            settledFor,
            filledWith,
            form: Option.match(revision, {
              onNone: () => editor.form,
              onSome: value =>
                form.fill(editor.form, { [expectKey!]: value } as Partial<Value>).model,
            }),
          })
        }

        const sync: Update.Step<Root, never, never> = root => ({
          model: settled(refused(filledOf(root))),
        })

        /** Why the server refused the last save, when it refused it as data. */
        const refusalOf = (root: Root): Option.Option<unknown> => {
          const { requestId } = slice.get(root)
          return requestId === null ? Option.none() : data.refusal(root, requestId, mutation)
        }

        const saveOf = (root: Root): MutationStatus => {
          const { requestId } = slice.get(root)
          return requestId === null ? { _tag: 'Unknown' } : data.mutation(root, requestId)
        }

        return {
          /** For the placement: a valid submit becomes the mutation, and its request is remembered. */
          onOut:
            (submitted: Submitted<Value>): Step<Root> =>
            root => {
              // A declared write is told what changed, so it writes, and shows, only that.
              const started = data.mutate(
                root,
                mutation,
                submitted.value,
                mutation.write === undefined
                  ? undefined
                  : { keys: changedKeys(slice.get(root), submitted.value) },
              )
              const editor = slice.get(started.model)
              return {
                model: slice.set(started.model, {
                  ...editor,
                  requestId: started.requestId,
                  edited: false,
                  sent: Option.some(submitted.value as Readonly<Record<string, unknown>>),
                }),
                commands: [started.command],
              }
            },

          /**
           * For `Data.subscriptions`: while an id is being edited, what it loads is
           * a requirement like any Surface's, so Remote fetches and retains it.
           */
          active: data.active<RemoteData<Row>>(name, root => {
            const { mode, target } = slice.get(root)
            return mode === 'edit' && target !== null
              ? Option.some(data.get(current, target))
              : Option.none()
          }),

          sync,

          /**
           * Wraps the application's `update` so `sync` runs after every Message:
           * the value may arrive with any of them.
           */
          after:
            <Message, Result extends { readonly model: Root }>(
              update: (model: Root, message: Message) => Result,
            ) =>
            (model: Root, message: Message): Result => {
              const next = update(model, message)
              return { ...next, model: sync(next.model).model }
            },

          /**
           * Asks for the value being edited again: `Data.refresh`, for a retry
           * button while `status` is `LoadFailed`. A failed read is not retried on
           * its own. Unchanged while nothing is open for editing.
           */
          refresh: (root: Root): Root => {
            const { mode, target } = slice.get(root)
            return mode === 'edit' && target !== null
              ? data.refresh(root, data.get(current, target))
              : root
          },

          /** Why the last save failed, while `status` is `SaveFailed`. */
          saveError: (root: Root): RemoteError | undefined => {
            const save = saveOf(root)
            return save._tag === 'Failed' ? save.error : undefined
          },

          /**
           * The form's keys the row being edited does not let its reader set, by
           * `locks`, for `foldkit-mixins-form`'s `locked`. None for something new,
           * whose create the server checks, and none until the row is loaded.
           */
          locked: (root: Root): ReadonlyArray<keyof Fields & string> =>
            locks === undefined
              ? []
              : Option.match(known(root), {
                  onNone: () => [],
                  onSome: row =>
                    writes.flatMap(([key, member]) => (locks.locked(row, member) ? [key] : [])),
                }),

          /** The id being edited, typed as the Entity's own; `null` for a new one or a closed editor. */
          target: (root: Root): IdOf<E> | null => slice.get(root).target as IdOf<E> | null,
          status: (root: Root): EditorStatus => {
            const editor = slice.get(root)
            if (editor.mode === 'closed') return 'Closed'
            // Gone outranks everything: a save that landed describes a thing that no longer exists.
            const read = loaded(root)
            if (read?._tag === 'NotFound') return 'NotFound'
            const save = saveOf(root)
            // Changed since the last save: that save no longer describes the form.
            if (editor.edited) return moved(root) ? 'Moved' : 'Editing'
            switch (save._tag) {
              case 'Pending':
                return 'Saving'
              case 'Failed':
                return Option.exists(refusalOf(root), Refusal.isConflict)
                  ? 'Conflict'
                  : 'SaveFailed'
              case 'Applied':
                // Saved, and since moved on by someone else.
                return moved(root) ? 'Moved' : 'Saved'
              case 'Unknown':
                if (editor.filled) return moved(root) ? 'Moved' : 'Editing'
                return read?._tag === 'Failed' ? 'LoadFailed' : 'Loading'
            }
          },
        }
      },
    }
  },
}

export { Display, type DisplayColumn, type DisplayKind, type DisplayWords } from './display.js'
export { Sort, type SortState, type SortedColumn } from './sort.js'
