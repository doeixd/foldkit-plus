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
import { Entity, type AnyEntity, type EntityInput } from 'foldkit-entity'
import type { Submitted } from 'foldkit-form'
import type { MutationDescriptor, RemoteClient, RemoteData, RemoteMessage } from 'foldkit-remote'
import type { ActiveSurface, ModelRef, Projection } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import type * as Update from 'foldkit/update'

/** The parts of a `Form.make` result an editor wraps. */
interface EditableForm<
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
interface DomainLike<Root> {
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
  readonly store: {
    readonly get: (root: Root) => {
      readonly mutations: {
        readonly pending: ReadonlySet<string>
        readonly applied: ReadonlySet<string>
        readonly failed: ReadonlySet<string>
      }
    }
  }
  readonly contract: { readonly owner?: object | undefined }
}

type Step<Root> = Update.Step<Root, RemoteMessage, RemoteClient>

export const Admin = {
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

          status: (root: Root): EditorStatus => {
            const editor = slice.get(root)
            if (editor.mode === 'closed') return 'Closed'
            if (editor.requestId !== null) {
              const { pending, failed, applied } = data.store.get(root).mutations
              if (pending.has(editor.requestId)) return 'Saving'
              if (failed.has(editor.requestId)) return 'SaveFailed'
              if (applied.has(editor.requestId)) return 'Saved'
            }
            if (editor.filled) return 'Editing'
            const read = loaded(root)
            return read?._tag === 'NotFound'
              ? 'NotFound'
              : read?._tag === 'Failed'
                ? 'LoadFailed'
                : 'Loading'
          },
        }
      },
    }
  },
}
