/**
 * The authoring editor: a form, the entry it belongs to, and the draft that
 * keeps what the author has entered.
 *
 * Saving is automatic and is not publishing. Each edit starts a rest, and the
 * edit that is still the last one when its rest ends saves the form as it
 * stands, valid or not. Publishing submits the form, so its rules and checks
 * decide; what is published is the saved draft, so a publish saves first.
 *
 * The Bundle holds what is the editor's own: the form's Model and how far the
 * saves have got. What the server holds is read from Remote, never copied: the
 * draft's `updatedAt` a save is based on, and the entry's `revision` a publish is.
 */
import { Duration, Effect, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, type AnyEntity } from 'foldkit-entity'
import type { Submitted } from 'foldkit-form'
import type {
  MutationStatus,
  OptimisticOperation,
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
import type { State } from './lifecycle.js'

/** How the form came to hold what it holds. */
export type Resumed =
  /** The draft's saved Model: the form exactly as it was left, errors and all. */
  | 'Model'
  /** The draft's values, key by key, keeping what the form still accepts. */
  | 'Values'
  /** What is published: there was no draft. */
  | 'Published'
  /** There was a draft and nothing of it fits the form any more; what is published is shown. */
  | 'Lost'
  /** Something new. */
  | 'Blank'

export type EditorStatus =
  | 'Closed'
  | 'Loading'
  | 'NotFound'
  | 'LoadFailed'
  /** Edited since the last save. */
  | 'Editing'
  | 'Saving'
  | 'Saved'
  /** Someone else saved or published in between. The author's text is still in the form. */
  | 'Conflict'
  | 'SaveFailed'
  | 'Publishing'
  | 'Published'
  | 'PublishFailed'
  | 'Scheduling'
  /** Promised for later. The entry's `state` says for when, and whether it happened. */
  | 'Scheduled'
  | 'ScheduleFailed'

/**
 * An editor's slice of the parent Model. `edits` counts the edits made, and
 * `savedEdit` is the count the last save was started at: the form is saved when
 * they agree.
 */
export interface EditorModel<FormModel> {
  readonly form: FormModel
  readonly mode: 'closed' | 'new' | 'edit'
  readonly entry: string | null
  readonly filled: boolean
  readonly resumed: Resumed | null
  readonly edits: number
  readonly savedEdit: number
  readonly saveId: string | null
  readonly saveWanted: boolean
  readonly publishId: string | null
  readonly publishWanted: boolean
  /** When the publish that is wanted, under way or last settled is a promise for later: for when. */
  readonly scheduleAt: string | null
  /** The discard or unpublish in progress or last settled. */
  readonly otherId: string | null
  /** Whether what is in the form is laid over the store, for the application's own views to draw. */
  readonly previewing: boolean
  /** What the overlay was last made of: the edit, and the row it is shown on. */
  readonly previewedAs: string | null
  /** After a conflict: waiting for the server's copy, to show it or to save over it. */
  readonly settling: 'reload' | 'overwrite' | null
}

/** What the editor asks of where it is placed; `onOut` answers each. */
export type EditorOut =
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Publish' }
  | { readonly _tag: 'Discard' }
  | { readonly _tag: 'Restore'; readonly revision: number }
  | { readonly _tag: 'Unpublish' }
  | { readonly _tag: 'Unschedule' }
  | { readonly _tag: 'Archive' }
  | { readonly _tag: 'Unarchive' }
  | { readonly _tag: 'Reload' }
  | { readonly _tag: 'Overwrite' }

/** The parts of a `Form.make` result the editor drives. */
export interface EditorForm<FormModel, FormMessage, Value> {
  readonly name: string
  readonly input: { readonly schema: Schema.Struct<any> }
  readonly bundle: {
    readonly Model: Schema.Codec<FormModel, unknown>
    readonly Message: Schema.Codec<FormMessage, unknown>
    readonly update: (
      model: FormModel,
      message: FormMessage,
      args: void,
    ) => Update.ReturnWithOutMessage<FormModel, FormMessage, Submitted<Value>, any>
  }
  readonly Message: { readonly Submitted: () => FormMessage }
  readonly initial: FormModel
  readonly fill: (model: FormModel, values: Partial<Value>) => { readonly model: FormModel }
  readonly partial: (model: FormModel) => Partial<Value>
  readonly settled: (model: FormModel) => FormModel
  readonly field: (model: FormModel, key: never) => { readonly value: unknown }
}

/** The parts of a bound Remote domain the editor uses. */
export interface EditorDomain<Root> {
  // Method syntax: the descriptors are checked where the domain is made, not here.
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
  mutation(model: Root, requestId: string): MutationStatus
  refresh(model: Root, target: any): Root
  overlay(model: Root, id: string, optimistic: ReadonlyArray<OptimisticOperation>): Root
  lift(model: Root, id: string): Root
  readonly contract: { readonly owner?: object | undefined }
}

export interface EditorContent<FormModel, FormMessage, Value> {
  readonly name: string
  readonly entity: AnyEntity
  readonly form: EditorForm<FormModel, FormMessage, Value>
  readonly roles: { readonly label: { readonly key: string } | undefined }
  readonly preview?:
    ((value: Partial<Value>, id: string) => ReadonlyArray<OptimisticOperation>) | undefined
}

const isEdit = (message: { readonly _tag: string; readonly message?: unknown }): boolean =>
  message._tag === 'Nested'
    ? isEdit(message.message as { readonly _tag: string })
    : ['Changed', 'RowAdded', 'RowRemoved', 'Reset'].includes(message._tag)

const held = <A>(read: RemoteData<A> | undefined): A | undefined =>
  read?._tag === 'Ready' || read?._tag === 'Refreshing' ? read.value : undefined

/** Read, and not being read again: what the server said last, not what it said before. */
const fresh = (read: RemoteData<unknown> | undefined): boolean =>
  read?._tag === 'Ready' || read?._tag === 'NotFound'

// The editor's own Messages, beside the form's. `Rested` is the end of the
// rest an edit started; the rest are what an author asks.
export const EditorMessage = defineMessageUnion({
  Rested: { edit: Schema.Number },
  PublishAsked: {},
  /** Lays what is in the form over the store, until `PreviewHidden`. Nothing is sent. */
  PreviewShown: {},
  PreviewHidden: {},
  /** Publishes later: the form is submitted and saved now, and the server keeps the promise. */
  ScheduleAsked: { at: Schema.String },
  UnscheduleAsked: {},
  ArchiveAsked: {},
  UnarchiveAsked: {},
  DiscardAsked: {},
  /** Makes a revision's value the working copy. It replaces what is here, and publishes nothing. */
  RestoreAsked: { revision: Schema.Number },
  UnpublishAsked: {},
  /** After a conflict: drop what is here and show the server's copy. */
  ReloadAsked: {},
  /** After a conflict: save what is here over the server's copy. */
  OverwriteAsked: {},
})
export type EditorMessage = typeof EditorMessage.Type
const Own = EditorMessage
type Own = EditorMessage

/**
 * A form's Submodel view as the view of the editor that wraps it, for
 * `Bundle.withView`: the editor's Model holds the form's under `form`, and what
 * the form's view sends is among the editor's Messages.
 *
 * ```ts
 * Editor.bundle.pipe(Bundle.withView(Cms.editorView(FormView.submodel(form, view))))
 * ```
 */
export const editorView = <FormModel, FormMessage, ViewInputs>(
  view: Submodel.View<FormModel, FormMessage, ViewInputs>,
): Submodel.View<EditorModel<FormModel>, FormMessage | EditorMessage, ViewInputs> =>
  Submodel.defineView<EditorModel<FormModel>, FormMessage | EditorMessage, ViewInputs>(((
    model: EditorModel<FormModel>,
    inputs: ViewInputs,
    h: HtmlBuilder<FormMessage>,
  ): Html =>
    (view as (model: FormModel, inputs: ViewInputs, h: HtmlBuilder<FormMessage>) => Html)(
      model.form,
      inputs,
      h,
    )) as never)

export const makeEditor =
  (cms: {
    readonly Entities: { readonly Entry: AnyEntity; readonly Draft: AnyEntity }
    readonly Operations: Readonly<
      Record<
        | 'SaveDraft'
        | 'DiscardDraft'
        | 'Publish'
        | 'Unpublish'
        | 'Schedule'
        | 'Unschedule'
        | 'Archive'
        | 'Unarchive'
        | 'Restore',
        any
      >
    >
  }) =>
  <const Name extends string, FormModel, FormMessage extends { readonly _tag: string }, Value>(
    name: Name,
    config: {
      readonly content: EditorContent<FormModel, FormMessage, Value>
      /** How long after the last edit the draft is saved. Default: one second. */
      readonly rest?: Duration.Input
      /** Bumped when the form changes so that a saved Model no longer fits it. */
      readonly version?: string
      /** What an entry with no label yet is called in the worklist. */
      readonly untitled?: string
    },
  ) => {
    type Model = EditorModel<FormModel>
    const { content } = config
    const { form } = content
    const rest = config.rest ?? '1 second'
    const formTag = `${form.name}@${config.version ?? '1'}`

    const closed: Model = {
      form: form.initial,
      mode: 'closed',
      entry: null,
      filled: false,
      resumed: null,
      edits: 0,
      savedEdit: 0,
      saveId: null,
      saveWanted: false,
      publishId: null,
      publishWanted: false,
      scheduleAt: null,
      otherId: null,
      previewing: false,
      previewedAs: null,
      settling: null,
    }
    const Model = Schema.Struct({
      form: form.bundle.Model,
      mode: Schema.Literals(['closed', 'new', 'edit']),
      entry: Schema.NullOr(Schema.String),
      filled: Schema.Boolean,
      resumed: Schema.NullOr(Schema.Literals(['Model', 'Values', 'Published', 'Lost', 'Blank'])),
      edits: Schema.Number,
      savedEdit: Schema.Number,
      saveId: Schema.NullOr(Schema.String),
      saveWanted: Schema.Boolean,
      publishId: Schema.NullOr(Schema.String),
      publishWanted: Schema.Boolean,
      scheduleAt: Schema.NullOr(Schema.String),
      otherId: Schema.NullOr(Schema.String),
      previewing: Schema.Boolean,
      previewedAs: Schema.NullOr(Schema.String),
      settling: Schema.NullOr(Schema.Literals(['reload', 'overwrite'])),
    }) as unknown as Schema.Codec<Model, unknown>

    type Message = FormMessage | Own
    const Message = Schema.Union([form.bundle.Message, Own]) as unknown as Schema.Codec<
      Message,
      unknown
    >
    const own = new Set([
      'Rested',
      'PublishAsked',
      'PreviewShown',
      'PreviewHidden',
      'ScheduleAsked',
      'UnscheduleAsked',
      'ArchiveAsked',
      'UnarchiveAsked',
      'DiscardAsked',
      'RestoreAsked',
      'UnpublishAsked',
      'ReloadAsked',
      'OverwriteAsked',
    ])
    const isOwn = (message: Message): message is Own => own.has(message._tag)

    const asks: Readonly<
      Record<
        Exclude<
          Own['_tag'],
          | 'Rested'
          | 'PublishAsked'
          | 'ScheduleAsked'
          | 'RestoreAsked'
          | 'PreviewShown'
          | 'PreviewHidden'
        >,
        EditorOut
      >
    > = {
      DiscardAsked: { _tag: 'Discard' },
      UnpublishAsked: { _tag: 'Unpublish' },
      UnscheduleAsked: { _tag: 'Unschedule' },
      ArchiveAsked: { _tag: 'Archive' },
      UnarchiveAsked: { _tag: 'Unarchive' },
      ReloadAsked: { _tag: 'Reload' },
      OverwriteAsked: { _tag: 'Overwrite' },
    }

    type Returned = Update.ReturnWithOutMessage<Model, Message, EditorOut, any>

    const viaForm = (model: Model, message: FormMessage): Returned => {
      const next = form.bundle.update(model.form, message, undefined)
      const edited = isEdit(message)
      const edits = edited ? model.edits + 1 : model.edits
      const commands: ReadonlyArray<Command<Message, never, any>> = [
        ...((next.commands ?? []) as ReadonlyArray<Command<Message, never, any>>),
        ...(edited
          ? [
              {
                name: `${name}.rest`,
                args: { edit: edits },
                effect: Effect.sleep(rest).pipe(Effect.as(Own.Rested({ edit: edits }))),
              } as Command<Message, never, any>,
            ]
          : []),
      ]
      const result = { model: { ...model, form: next.model, edits }, commands }
      // A submit that went through is a publish: the form's rules and checks decided.
      return next.outMessage === undefined ? result : { ...result, outMessage: { _tag: 'Publish' } }
    }

    const bundle = Bundle.make(name, {
      Model,
      Message,
      init: () => ({ model: closed }),
      update: (model: Model, message: Message): Returned => {
        if (model.mode === 'closed') return { model }
        // A submit from the form's own button is a publish now, whatever was asked before.
        if (!isOwn(message))
          return viaForm(
            message._tag === 'Submitted' ? { ...model, scheduleAt: null } : model,
            message,
          )
        switch (message._tag) {
          case 'Rested':
            // An edit since then started its own rest; this one has nothing to say.
            return message.edit === model.edits && model.edits > model.savedEdit
              ? { model, outMessage: { _tag: 'Save' } }
              : { model }
          case 'PublishAsked':
            return viaForm({ ...model, scheduleAt: null }, form.Message.Submitted())
          case 'PreviewShown':
            // A capability is declared, never implied.
            return content.preview === undefined
              ? { model }
              : { model: { ...model, previewing: true, previewedAs: null } }
          case 'PreviewHidden':
            return { model: { ...model, previewing: false } }
          case 'RestoreAsked':
            return { model, outMessage: { _tag: 'Restore', revision: message.revision } }
          case 'ScheduleAsked':
            return viaForm({ ...model, scheduleAt: message.at }, form.Message.Submitted())
          default:
            return { model, outMessage: asks[message._tag] }
        }
      },
      helpers: {
        /** Opens an entry: its draft is resumed, or what is published is shown. */
        open: (_: Model, entry: string) => ({
          model: { ...closed, mode: 'edit' as const, entry },
        }),
        /**
         * Something new, under an id made where this is called (`Cms.newEntryId()`,
         * in a Command or an event handler): the first save makes the entry.
         */
        create: (_: Model, entry: string) => ({
          model: {
            ...closed,
            mode: 'new' as const,
            entry,
            filled: true,
            resumed: 'Blank' as const,
          },
        }),
        close: () => ({ model: closed }),
      },
    })

    const EntryRead = Entity.select(
      cms.Entities.Entry as never,
      {
        type: true,
        targetId: true,
        revision: true,
        archivedAt: true,
      } as never,
    )
    const EntryState = Entity.select(cms.Entities.Entry as never, { state: true } as never)
    const DraftRead = Entity.select(
      cms.Entities.Draft as never,
      {
        values: true,
        model: true,
        form: true,
        updatedAt: true,
      } as never,
    )
    const RowRead = Entity.selectFor(form.input as never)

    const decodeModel = Schema.decodeUnknownOption(form.bundle.Model)
    const encodeModel = Schema.encodeUnknownSync(form.bundle.Model as never)

    /** The keys of some saved values the form still accepts. */
    const fitting = (values: unknown): Partial<Value> => {
      if (typeof values !== 'object' || values === null) return {}
      const fields = form.input.schema.fields as Readonly<Record<string, Schema.Schema<unknown>>>
      return Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => fields[key] !== undefined && Schema.is(fields[key])(value),
        ),
      ) as Partial<Value>
    }

    return {
      bundle,
      Message: Own,
      /** What is saved as a draft's `form`: the form's name and the version given. */
      formTag,

      at: <Root>(where: {
        readonly data: EditorDomain<Root>
        readonly model: ModelRef<Root, Model>
      }) => {
        type Step = Update.Step<Root, RemoteMessage, RemoteClient>
        const { data, model: slice } = where

        const entryOf = (root: Root) => {
          const { mode, entry, saveId } = slice.get(root)
          // Something new is not on the server until its first save.
          return entry === null || mode === 'closed' || (mode === 'new' && saveId === null)
            ? undefined
            : entry
        }
        const projections = {
          entry: (root: Root) => {
            const entry = entryOf(root)
            return entry === undefined ? undefined : data.get(EntryRead, entry)
          },
          state: (root: Root) => {
            const entry = entryOf(root)
            return entry === undefined ? undefined : data.get(EntryState, entry)
          },
          draft: (root: Root) => {
            const entry = entryOf(root)
            return entry === undefined ? undefined : data.get(DraftRead, entry)
          },
          row: (root: Root) => {
            const target = held<{ readonly targetId: string | null }>(
              projections.entry(root)?.read(root),
            )?.targetId
            return target == null ? undefined : data.get(RowRead, target)
          },
        }
        const read = (root: Root, part: keyof typeof projections): RemoteData<any> | undefined =>
          projections[part](root)?.read(root)

        const statusOf = (root: Root, requestId: string | null): MutationStatus =>
          requestId === null ? { _tag: 'Unknown' } : data.mutation(root, requestId)

        /** Shows what was loaded, once: the draft by the ladder, else what is published. */
        const fill = (root: Root): Root => {
          const editor = slice.get(root)
          if (editor.filled || editor.mode !== 'edit') return root
          // A discard under way decides what there is to show.
          if (statusOf(root, editor.otherId)._tag === 'Pending') return root
          const entry = read(root, 'entry')
          const draft = read(root, 'draft')
          // After a conflict, what was held before is not what the server holds now.
          const arrived =
            editor.settling === 'reload'
              ? fresh
              : (r: RemoteData<unknown> | undefined) =>
                  held(r) !== undefined || r?._tag === 'NotFound'
          if (!arrived(entry) || !arrived(draft)) return root
          const entryValue = held<{ readonly targetId: string | null }>(entry)
          if (entryValue === undefined) return root
          const shown = (resumed: Resumed, next: FormModel): Root =>
            slice.set(root, {
              ...closed,
              mode: 'edit',
              entry: editor.entry,
              form: next,
              filled: true,
              resumed,
              // A discard that led here is still the last thing that was asked.
              otherId: editor.otherId,
            })

          const saved = held<{
            readonly values: unknown
            readonly model: unknown
            readonly form: string
          }>(draft)
          if (saved !== undefined) {
            const model = saved.form === formTag ? decodeModel(saved.model) : Option.none()
            // A check that was running when it was saved will never answer.
            if (Option.isSome(model)) return shown('Model', form.settled(model.value))
            const values = fitting(saved.values)
            if (Object.keys(values).length > 0)
              return shown('Values', form.fill(form.initial, values).model)
          }
          const lost: Resumed = saved === undefined ? 'Published' : 'Lost'
          if (entryValue.targetId === null)
            return shown(saved === undefined ? 'Blank' : 'Lost', form.initial)
          const row = read(root, 'row')
          if (!arrived(row)) return root
          const rowValue = held<Readonly<Record<string, unknown>>>(row)
          return rowValue === undefined
            ? shown(lost, form.initial)
            : shown(
                lost,
                form.fill(
                  form.initial,
                  Entity.valuesFor(form.input as never, rowValue as never) as Partial<Value>,
                ).model,
              )
        }

        const startSave: Step = root => {
          const editor = slice.get(root)
          const values = form.partial(editor.form) as Readonly<Record<string, unknown>>
          const labelKey = content.roles.label?.key
          const typed =
            labelKey === undefined ? '' : form.field(editor.form, labelKey as never).value
          const label = typeof typed === 'string' ? typed.trim() : ''
          const basedOn =
            held<{ readonly updatedAt: string }>(read(root, 'draft'))?.updatedAt ?? null
          const started = data.mutate(root, cms.Operations.SaveDraft, {
            entry: editor.entry,
            type: content.name,
            label: label === '' ? (config.untitled ?? 'Untitled') : label,
            values,
            model: encodeModel(editor.form),
            form: formTag,
            basedOn,
          })
          return {
            model: slice.set(started.model, {
              ...slice.get(started.model),
              saveId: started.requestId,
              // A save starts a new round: the last publish no longer describes the form.
              publishId: null,
              otherId: null,
              savedEdit: editor.edits,
              saveWanted: false,
              settling: null,
            }),
            commands: [started.command],
          }
        }

        /** An operation that names the entry and nothing else. The server's patches say what it did. */
        const simple =
          (operation: 'Unpublish' | 'Unschedule' | 'Archive' | 'Unarchive'): Step =>
          root => {
            const editor = slice.get(root)
            if (editor.entry === null) return { model: root }
            const started = data.mutate(root, cms.Operations[operation], { entry: editor.entry })
            return {
              model: slice.set(started.model, {
                ...slice.get(started.model),
                otherId: started.requestId,
              }),
              commands: [started.command],
            }
          }

        /**
         * A discarded draft takes what is on screen with it, the edits still resting
         * included. What is published is shown again once the discard has settled;
         * something never published has nothing left, and the editor closes.
         */
        const discard: Step = root => {
          const editor = slice.get(root)
          if (editor.entry === null) return { model: root }
          // Something new that was never saved is only here.
          if (editor.mode === 'new' && editor.saveId === null)
            return { model: slice.set(root, closed) }
          const unpublished =
            held<{ readonly targetId: string | null }>(read(root, 'entry'))?.targetId == null
          const started = data.mutate(root, cms.Operations.DiscardDraft, { entry: editor.entry })
          return {
            model: slice.set(
              started.model,
              unpublished
                ? closed
                : {
                    ...closed,
                    mode: 'edit',
                    entry: editor.entry,
                    otherId: started.requestId,
                    settling: 'reload',
                  },
            ),
            commands: [started.command],
          }
        }

        /** The form is emptied, and filled from the restored draft once the restore has settled. */
        const restore =
          (revision: number): Step =>
          root => {
            const editor = slice.get(root)
            if (editor.entry === null) return { model: root }
            const started = data.mutate(root, cms.Operations.Restore, {
              entry: editor.entry,
              revision,
            })
            return {
              model: slice.set(started.model, {
                ...closed,
                mode: 'edit',
                entry: editor.entry,
                otherId: started.requestId,
                settling: 'reload',
              }),
              commands: [started.command],
            }
          }

        /**
         * What follows from what has arrived: the loaded value is shown, a save
         * that waited its turn starts, and a publish goes once its draft is saved.
         */
        const overlayId = `${name}.preview`
        /**
         * What is in the form, over the store, while preview is on: made again when
         * the form has moved on, and lifted the moment it is off, however that came
         * about (a close, a discard, a reload).
         */
        const previewed = (root: Root): Root => {
          const editor = slice.get(root)
          if (!editor.previewing || content.preview === undefined || editor.entry === null)
            return data.lift(root, overlayId)
          // Something new is shown under its entry's id until publishing gives it a row.
          const id =
            held<{ readonly targetId: string | null }>(read(root, 'entry'))?.targetId ??
            editor.entry
          const as = `${editor.edits}:${id}`
          if (editor.previewedAs === as) return root
          const shown = data.overlay(
            root,
            overlayId,
            content.preview(form.partial(editor.form), id),
          )
          return slice.set(shown, { ...slice.get(shown), previewedAs: as })
        }

        const sync: Step = given => {
          let root = previewed(fill(given))
          const commands: Array<Command<RemoteMessage, never, RemoteClient>> = []
          const run = (step: Step) => {
            const next = step(root)
            root = next.model
            commands.push(...(next.commands ?? []))
          }
          const editor = () => slice.get(root)
          if (editor().mode === 'closed' || !editor().filled) return { model: root }

          const saving = () => statusOf(root, editor().saveId)._tag === 'Pending'
          // Saving over someone else's copy is based on that copy, once it is here.
          if (editor().settling === 'overwrite' && fresh(read(root, 'draft'))) run(startSave)
          if (editor().saveWanted && !saving() && editor().settling === null) run(startSave)

          // A second ask while the first is on its way is the same ask.
          if (editor().publishWanted && statusOf(root, editor().publishId)._tag === 'Pending')
            root = slice.set(root, { ...editor(), publishWanted: false })
          if (editor().publishWanted && !saving() && editor().settling === null) {
            const save = statusOf(root, editor().saveId)
            const resumedDraft = editor().resumed === 'Model' || editor().resumed === 'Values'
            const saved =
              editor().edits === editor().savedEdit &&
              (editor().saveId === null ? resumedDraft : save._tag === 'Applied')
            if (save._tag === 'Failed' && editor().edits === editor().savedEdit) {
              // The draft could not be saved, so there is nothing to publish; the save says why.
              root = slice.set(root, { ...editor(), publishWanted: false })
            } else if (!saved) {
              run(startSave)
            } else {
              const basedOn =
                held<{ readonly revision: number | null }>(read(root, 'entry'))?.revision ?? null
              const at = editor().scheduleAt
              const started =
                at === null
                  ? data.mutate(root, cms.Operations.Publish, { entry: editor().entry, basedOn })
                  : data.mutate(root, cms.Operations.Schedule, { entry: editor().entry, at })
              root = slice.set(started.model, {
                ...slice.get(started.model),
                publishId: started.requestId,
                publishWanted: false,
              })
              commands.push(started.command)
            }
          }
          return { model: root, commands }
        }

        const failure = (root: Root): RemoteError | undefined => {
          const editor = slice.get(root)
          for (const id of [editor.publishId, editor.saveId, editor.otherId]) {
            const status = statusOf(root, id)
            if (status._tag === 'Failed') return status.error
          }
          return undefined
        }

        const active = (part: keyof typeof projections): ActiveSurface<Root> => ({
          name: `${name}.${part}`,
          owner: data.contract.owner ?? {},
          projectionOf: projections[part],
        })

        return {
          /** For the placement: what the editor asked becomes the mutation, or waits its turn. */
          onOut:
            (out: EditorOut): Step =>
            root => {
              const editor = slice.get(root)
              switch (out._tag) {
                case 'Save':
                  return sync(slice.set(root, { ...editor, saveWanted: true }))
                case 'Publish':
                  return sync(slice.set(root, { ...editor, publishWanted: true }))
                case 'Restore':
                  return restore(out.revision)(root)
                case 'Discard':
                  return discard(root)
                case 'Unpublish':
                  return simple('Unpublish')(root)
                case 'Unschedule':
                  return simple('Unschedule')(root)
                case 'Archive':
                  return simple('Archive')(root)
                case 'Unarchive':
                  return simple('Unarchive')(root)
                case 'Reload': {
                  const refreshed = (['entry', 'draft', 'row'] as const).reduce((next, part) => {
                    const projection = projections[part](next)
                    return projection === undefined ? next : data.refresh(next, projection)
                  }, root)
                  return {
                    model: slice.set(refreshed, {
                      ...closed,
                      mode: 'edit',
                      entry: editor.entry,
                      settling: 'reload',
                    }),
                  }
                }
                case 'Overwrite': {
                  const projection = projections.draft(root)
                  const refreshed = projection === undefined ? root : data.refresh(root, projection)
                  return {
                    model: slice.set(refreshed, { ...slice.get(refreshed), settling: 'overwrite' }),
                  }
                }
              }
            },

          /**
           * For `Data.subscriptions`, spread beside the application's own: the entry,
           * its state, its draft, and the row what is published is shown from. Each
           * is a requirement while an entry is open, so Remote fetches and retains it.
           */
          actives: {
            [`${name}.entry`]: active('entry'),
            [`${name}.state`]: active('state'),
            [`${name}.draft`]: active('draft'),
            [`${name}.row`]: active('row'),
          } as Readonly<
            Record<`${Name}.${'entry' | 'state' | 'draft' | 'row'}`, ActiveSurface<Root>>
          >,

          sync,

          /**
           * Saves what has not been saved, now, without waiting for the rest to end.
           * Run it before `close` or `open`, which drop what is in the form: an
           * author who types and leaves within the rest would otherwise lose it.
           */
          flush: (root => {
            const editor = slice.get(root)
            return editor.mode === 'closed' || !editor.filled || editor.edits === editor.savedEdit
              ? { model: root }
              : sync(slice.set(root, { ...editor, saveWanted: true }))
          }) satisfies Step,

          /**
           * Wraps the application's `update` so `sync` runs after every Message: a
           * value may arrive, or a save settle, with any of them.
           */
          after:
            <
              Message,
              Result extends { readonly model: Root; readonly commands?: ReadonlyArray<any> },
            >(
              update: (model: Root, message: Message) => Result,
            ) =>
            (model: Root, message: Message): Result => {
              const next = update(model, message)
              const synced = sync(next.model)
              return {
                ...next,
                model: synced.model,
                commands: [...(next.commands ?? []), ...(synced.commands ?? [])],
              }
            },

          /** Whether this content type can be previewed, and whether it is being. */
          canPreview: content.preview !== undefined,
          previewing: (root: Root): boolean => slice.get(root).previewing,
          /**
           * The id the application's own pages know this content by: the row's, or
           * the entry's while there is no row. It is what a preview is shown under.
           */
          pageId: (root: Root): string | null =>
            held<{ readonly targetId: string | null }>(read(root, 'entry'))?.targetId ??
            slice.get(root).entry,
          /** The entry being edited; `null` while closed. */
          entry: (root: Root): string | null => slice.get(root).entry,
          /** How the form came to hold what it holds; `Lost` is worth telling the author. */
          resumed: (root: Root): Resumed | null => slice.get(root).resumed,
          /** The entry's lifecycle state, as the server last derived it. */
          state: (root: Root): State | undefined =>
            held<{ readonly state: State }>(read(root, 'state'))?.state,
          /** Why the last publish, save, discard or unpublish failed. */
          error: failure,

          status: (root: Root): EditorStatus => {
            const editor = slice.get(root)
            if (editor.mode === 'closed') return 'Closed'
            if (!editor.filled) {
              const entry = read(root, 'entry')
              if (entry?._tag === 'NotFound') return 'NotFound'
              return [entry, read(root, 'draft'), read(root, 'row')].some(
                part => part?._tag === 'Failed',
              )
                ? 'LoadFailed'
                : 'Loading'
            }
            const publish = statusOf(root, editor.publishId)
            const save = statusOf(root, editor.saveId)
            const later = editor.scheduleAt !== null
            if (publish._tag === 'Pending') return later ? 'Scheduling' : 'Publishing'
            if (save._tag === 'Pending' || editor.settling === 'overwrite') return 'Saving'
            const conflicted = (status: MutationStatus) =>
              status._tag === 'Failed' && status.error.message.includes('CmsConflict')
            if (editor.edits > editor.savedEdit) return 'Editing'
            if (conflicted(save) || conflicted(publish)) return 'Conflict'
            if (save._tag === 'Failed') return 'SaveFailed'
            if (publish._tag === 'Failed') return later ? 'ScheduleFailed' : 'PublishFailed'
            if (publish._tag === 'Applied') return later ? 'Scheduled' : 'Published'
            return save._tag === 'Applied' ? 'Saved' : 'Editing'
          },
        }
      },
    }
  }
