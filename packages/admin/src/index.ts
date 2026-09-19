/**
 * `foldkit-admin` — management screens assembled from parts an application
 * already has.
 *
 * An editor joins a `foldkit-form` form, the Remote mutation its value feeds,
 * and the Entity they share: it loads what the form writes, shows it, turns a
 * valid submit into the mutation, and says how that went. Everything it makes is
 * ordinary Foldkit: a Bundle, an ActiveSurface, Update Steps. Nothing is
 * generated from an Entity alone; each capability is declared.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Entity,
  type AnyEntity,
  type EntityInput,
  type EntityMember,
  type Selection,
} from 'foldkit-entity'
import { Form, type FormControl, type Submitted } from 'foldkit-form'
import type {
  MutationDescriptor,
  Page,
  QueryDescriptor,
  MutationStatus,
  RemoteClient,
  RemoteData,
  RemoteError,
  RemoteMessage,
} from 'foldkit-remote'
import type { ActiveSurface, ModelRef, Projection } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
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
> {
  readonly bundle: {
    readonly name: Name
    readonly Model: Schema.Codec<FormModel, unknown>
    readonly Message: Schema.Codec<FormMessage, unknown>
    readonly update: (
      model: FormModel,
      message: FormMessage,
      args: void,
    ) => Update.ReturnWithOutMessage<FormModel, FormMessage, Submitted<Value>, never>
  }
  readonly input: EntityInput<E, Fields, Members>
  readonly initial: FormModel
  readonly fill: (model: FormModel, values: Partial<Value>) => { readonly model: FormModel }
}

/**
 * An editor's slice of the parent Model. `target` is the id being edited, or
 * `null` for a new one; `filled` is whether the loaded value has been shown;
 * `requestId` is the save in progress or last settled.
 */
export interface EditorModel<FormModel> {
  readonly form: FormModel
  readonly mode: 'closed' | 'new' | 'edit'
  readonly target: string | null
  readonly filled: boolean
  readonly requestId: string | null
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

/** The parts of a bound Remote domain an editor uses. */
export interface DomainLike<Root> {
  // Method syntax: the descriptors are checked where the editor is made, not here.
  mutate(
    model: Root,
    mutation: any,
    input: any,
  ): {
    readonly model: Root
    readonly requestId: string
    readonly command: Command<RemoteMessage, never, RemoteClient>
  }
  get(selection: any, id: string): Projection<Root, RemoteData<any>>
  query(query: any, input: any, options: any): Projection<Root, RemoteData<Page<any>>>
  next(model: Root, projection: any): { readonly query: string } | undefined
  fetch(ref: any): Command<RemoteMessage, never, RemoteClient>
  mutation(model: Root, requestId: string): MutationStatus
  readonly contract: { readonly owner?: object | undefined }
}

type Step<Root> = Update.Step<Root, RemoteMessage, RemoteClient>

/** One thing a relation picker offers. */
export interface Choice {
  readonly value: string
  readonly label: string
}

/** One column of a list, or one line of a detail: a member the Selection reads. */
export interface ListColumn<Key extends string = string> {
  readonly key: Key
  /** The schema's `title` annotation, else `Form.label` metadata, else the key. */
  readonly label: string
  readonly member: EntityMember
}

const columnLabel = (key: string, member: EntityMember): string => {
  const title =
    member._tag === 'Relation'
      ? undefined
      : Schema.resolveAnnotations(member.schema as Schema.Top)?.title
  return typeof title === 'string' ? title : (Form.labelOf(member) ?? key)
}

/** The selected members in the Selection's order, each with its label. */
const columnsOf = <Members>(
  selection: Selection<string, Members, Schema.Constraint>,
): ReadonlyArray<ListColumn<keyof Members & string>> => {
  const members: Readonly<Record<string, EntityMember>> = selection.entity.members
  return Object.keys(selection.members as object).map(key => ({
    key: key as keyof Members & string,
    label: columnLabel(key, members[key]!),
    member: members[key]!,
  }))
}

const RemoverMessage = defineMessageUnion({ Confirmed: {}, Cancelled: {} })
type RemoverMessage = typeof RemoverMessage.Type

const idle: RemoverModel = { target: null, requestId: null }

export const Admin = {
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

    /** The detail where it lives: `id` is the one shown, or `undefined` while none is. */
    at: <Root>(where: {
      readonly data: DomainLike<Root>
      readonly id: (root: Root) => string | undefined
    }) => {
      const projectionOf = (root: Root) => {
        const id = where.id(root)
        return id === undefined ? undefined : where.data.get(config.selection, id)
      }
      return {
        /** For `Data.subscriptions`: the value is fetched and retained while an id is shown. */
        active: {
          name,
          owner: where.data.contract.owner ?? {},
          projectionOf,
        } satisfies ActiveSurface<Root>,
        value: (root: Root): RemoteData<Row> =>
          projectionOf(root)?.read(root) ?? { _tag: 'Initial' },
      }
    },
  }),

  /**
   * Deleting through one mutation, with a yes in between: asked, confirmed,
   * deleted. What the mutation's input is for an id is `input`'s to say.
   */
  remover: <const Name extends string, Input>(
    name: Name,
    config: {
      readonly mutation: MutationDescriptor<string, Input, any>
      readonly input: (id: string) => Input
    },
  ) => {
    const bundle = Bundle.make(name, {
      Model: Schema.Struct({
        target: Schema.NullOr(Schema.String),
        requestId: Schema.NullOr(Schema.String),
      }) as unknown as Schema.Codec<RemoverModel, unknown>,
      Message: RemoverMessage,
      init: () => ({ model: idle }),
      update: (model: RemoverModel, message: RemoverMessage) =>
        message._tag === 'Cancelled' || model.target === null
          ? { model: idle }
          : { model, outMessage: { _tag: 'Confirmed', id: model.target } as ConfirmedRemoval },
      helpers: {
        /** Asks whether to delete `id`. Nothing is deleted until `Confirmed`. */
        ask: (_: RemoverModel, id: string) => ({ model: { target: id, requestId: null } }),
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
              const started = data.mutate(root, config.mutation, config.input(confirmed.id))
              return {
                model: slice.set(started.model, {
                  target: confirmed.id,
                  requestId: started.requestId,
                }),
                commands: [started.command],
              }
            },

          /** The id being asked about or deleted, for the words of a confirmation. */
          target: (root: Root): string | null => slice.get(root).target,

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
  list: <const Name extends string, EntityName extends string, Members, Row, Input>(
    name: Name,
    config: {
      readonly query: QueryDescriptor<string, Input, any>
      readonly selection: Selection<EntityName, Members, Schema.Constraint & { readonly Type: Row }>
      /** How many rows a page holds. Default 25. */
      readonly pageSize?: number
      /**
       * How a row reads as a choice in a relation picker: its id, and the words
       * that identify it to a person. Give it to a list that feeds pickers.
       */
      readonly choice?: {
        readonly value: (row: Row) => string
        readonly label: (row: Row) => string
      }
    },
  ) => {
    const { query, selection, pageSize = 25, choice } = config
    const columns = columnsOf(selection)

    return {
      name,
      /** The selected members in the Selection's order, each with its label. */
      columns,

      /**
       * The list where it lives. `input` is the query's input as the Model has
       * it (filters, a search term), or `undefined` while the list is not shown.
       */
      at: <Root>(where: {
        readonly data: DomainLike<Root>
        readonly input: (root: Root) => Input | undefined
      }) => {
        const { data, input } = where
        const projectionOf = (root: Root) => {
          const value = input(root)
          return value === undefined
            ? undefined
            : data.query(query, value, { select: selection, first: pageSize })
        }
        const page = (root: Root): RemoteData<Page<Row>> =>
          projectionOf(root)?.read(root) ?? { _tag: 'Initial' }

        return {
          /** For `Data.subscriptions`: the page and its rows are fetched and retained while shown. */
          active: {
            name,
            owner: data.contract.owner ?? {},
            projectionOf,
          } satisfies ActiveSurface<Root>,

          page,

          /** The Command that loads the next page onto this one, or `undefined` when there is none. */
          more: (root: Root): Command<RemoteMessage, never, RemoteClient> | undefined => {
            const projection = projectionOf(root)
            const next = projection === undefined ? undefined : data.next(root, projection)
            return next === undefined ? undefined : data.fetch(next)
          },

          name,
          /** The Entity the rows are of, which is how a picker finds the list for its target. */
          entity: selection.entity as AnyEntity,
          /** Whether the list was given a `choice`, so its rows can be a picker's choices. */
          offersChoices: choice !== undefined,

          /**
           * The loaded rows as a picker's choices, read through `choice`. Listing a
           * relation's target is this query, which the application chose and the
           * server authorizes; nothing is read because a relation exists.
           */
          choices: (root: Root): ReadonlyArray<Choice> => {
            if (choice === undefined)
              throw new Error(
                `Admin list "${name}": give it a "choice" to use its rows in a picker`,
              )
            const read = page(root)
            return read._tag === 'Ready' || read._tag === 'Refreshing'
              ? read.value.items.map(row => ({
                  value: choice.value(row),
                  label: choice.label(row),
                }))
              : []
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
   * Editor.bundle.pipe(Bundle.withView(Admin.editorView(FormView.submodel(form, view))))
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
   */
  options: <Key extends string, Root>(
    form: { readonly controls: ReadonlyArray<FormControl<Key>> },
    lists: ReadonlyArray<{
      readonly name: string
      readonly entity: AnyEntity
      readonly offersChoices: boolean
      readonly choices: (root: Root) => ReadonlyArray<Choice>
    }>,
  ): ((root: Root) => { readonly [K in Key]?: ReadonlyArray<Choice> }) => {
    const pickers = form.controls.flatMap(({ key, control }) => {
      if (control._tag !== 'RelationOne' && control._tag !== 'RelationMany') return []
      const list = lists.find(candidate => Entity.same(candidate.entity, control.target))
      if (list === undefined)
        throw new Error(
          `Admin.options: "${key}" picks a ${control.target.name}, and no list given is over ${control.target.name}`,
        )
      if (!list.offersChoices)
        throw new Error(
          `Admin.options: "${key}" would pick from list "${list.name}", which has no "choice"`,
        )
      return [[key, list] as const]
    })
    return root =>
      Object.fromEntries(pickers.map(([key, list]) => [key, list.choices(root)])) as {
        readonly [K in Key]?: ReadonlyArray<Choice>
      }
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
  >(
    name: Name,
    config: {
      readonly form: EditableForm<FormName, FormModel, FormMessage, Value, E, Fields, Members>
      readonly mutation: MutationDescriptor<string, Value, any>
    },
  ) => {
    type Model = EditorModel<FormModel>
    const { form, mutation } = config

    const closed: Model = {
      form: form.initial,
      mode: 'closed',
      target: null,
      filled: false,
      requestId: null,
    }
    const Model = Schema.Struct({
      form: form.bundle.Model,
      mode: Schema.Literals(['closed', 'new', 'edit']),
      target: Schema.NullOr(Schema.String),
      filled: Schema.Boolean,
      requestId: Schema.NullOr(Schema.String),
    }) as unknown as Schema.Codec<Model, unknown>

    // The editor's Messages are the form's own: it adds state around the form,
    // not a second vocabulary.
    const bundle = Bundle.make(name, {
      Model,
      Message: form.bundle.Message,
      init: () => ({ model: closed }),
      update: (model: Model, message: FormMessage) => {
        const next = form.bundle.update(model.form, message, undefined)
        // An edit after a save starts a new round; the last save no longer describes the form.
        const requestId = message._tag === 'Changed' ? null : model.requestId
        return next.outMessage === undefined
          ? { model: { ...model, form: next.model, requestId } }
          : { model: { ...model, form: next.model, requestId }, outMessage: next.outMessage }
      },
      helpers: {
        /** Edits `id`: the form is emptied, and filled once the current values arrive. */
        open: (_: Model, id: string) => ({
          model: { ...closed, mode: 'edit' as const, target: id },
        }),
        /** A blank form for a new one: nothing to load. */
        blank: () => ({ model: { ...closed, mode: 'new' as const, filled: true } }),
        close: () => ({ model: closed }),
      },
    })

    const current = Entity.selectFor(form.input)

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

        /** Shows the loaded value once, the first time it is there. Later refreshes leave the drafts alone. */
        const sync: Update.Step<Root, never, never> = root => {
          const editor = slice.get(root)
          const read = loaded(root)
          if (editor.filled || read === undefined) return { model: root }
          if (read._tag !== 'Ready' && read._tag !== 'Refreshing') return { model: root }
          const values = Entity.valuesFor(form.input, read.value) as Partial<Value>
          return {
            model: slice.set(root, {
              ...editor,
              form: form.fill(editor.form, values).model,
              filled: true,
            }),
          }
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
              const started = data.mutate(root, mutation, submitted.value)
              const editor = slice.get(started.model)
              return {
                model: slice.set(started.model, { ...editor, requestId: started.requestId }),
                commands: [started.command],
              }
            },

          /**
           * For `Data.subscriptions`: while an id is being edited, what it loads is
           * a requirement like any Surface's, so Remote fetches and retains it.
           */
          active: {
            name,
            owner: data.contract.owner ?? {},
            projectionOf: root => {
              const { mode, target } = slice.get(root)
              return mode === 'edit' && target !== null ? data.get(current, target) : undefined
            },
          } satisfies ActiveSurface<Root>,

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

          /** Why the last save failed, while `status` is `SaveFailed`. */
          saveError: (root: Root): RemoteError | undefined => {
            const save = saveOf(root)
            return save._tag === 'Failed' ? save.error : undefined
          },

          status: (root: Root): EditorStatus => {
            const editor = slice.get(root)
            if (editor.mode === 'closed') return 'Closed'
            // Gone outranks everything: a save that landed describes a thing that no longer exists.
            const read = loaded(root)
            if (read?._tag === 'NotFound') return 'NotFound'
            const save = saveOf(root)
            if (save._tag === 'Pending') return 'Saving'
            if (save._tag === 'Failed') return 'SaveFailed'
            if (save._tag === 'Applied') return 'Saved'
            if (editor.filled) return 'Editing'
            return read?._tag === 'Failed' ? 'LoadFailed' : 'Loading'
          },
        }
      },
    }
  },
}
