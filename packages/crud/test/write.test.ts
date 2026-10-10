/**
 * An editor whose mutation is a declared `Write`: a save names only the keys
 * the author changed from what the form was filled with, and shows them before
 * the server answers.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Write } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProjectInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProject = Mutation.write('EditProject', Write.update(EditProjectInput, { id: 'id' }))
const EditProjectForm = Form.make('EditProject', EditProjectInput, {
  inputs: { id: Input.hidden() },
  debounce: 0,
})
const Editor = Crud.editor('ProjectEditor', { form: EditProjectForm, mutation: EditProject })
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedProject: { id: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [EditProject] })
const ProjectEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: ProjectEditor.onOut })
const placements = Page.assemble(Placed)
const update = ProjectEditor.after(
  placements.update((model: Model, message: Message) =>
    message._tag === 'OpenedProject'
      ? Placed.helpers.open(message.id)(model)
      : Remote.reduces(message)
        ? { model: Data.reduce(model, message) }
        : { model },
  ),
)

const row = { id: 'p1', name: 'Apollo', status: 'active' }
/** The mutate requests the server was sent, in order. */
let sent: Array<{ readonly keys?: ReadonlyArray<string> | undefined }> = []
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: 'Project',
        id: request.id,
        values: row,
      })),
    })),
  query: () => Effect.die('no queries'),
  mutate: request =>
    Effect.sync(() => {
      sent.push(request)
      return { output: {}, entities: [] }
    }),
  live: () => Stream.empty,
})
beforeEach(() => {
  sent = []
})

const initial: Model = { remote: Remote.initial, editor: Editor.bundle.init().model }
const step = (model: Model, message: Message) => update(model, message)
const form = (model: Model, message: typeof EditProjectForm.Message.Type) =>
  step(model, Message.GotEditorMessage({ message })).model
/** Opens p1 and fills the form with what the server holds. */
const opened = async (): Promise<Model> => {
  const open = step(initial, Message.OpenedProject({ id: 'p1' })).model
  const projection = Option.getOrThrow(ProjectEditor.active.projectionOf(open))
  const loaded = await Effect.runPromise(
    Data.prefetch(open, projection).pipe(Effect.provide(Client)),
  )
  return ProjectEditor.sync(loaded).model
}
const shown = (model: Model) => {
  const read = Data.get(Entity.select(Project, { id: true, name: true, status: true }), 'p1').read(
    model,
  )
  return read._tag === 'Ready' ? read.value : read._tag
}
/** Submits, and runs the save it starts. */
const saved = async (model: Model) => {
  const submitted = step(
    model,
    Message.GotEditorMessage({ message: EditProjectForm.Message.Submitted() }),
  )
  for (const command of submitted.commands ?? []) {
    await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))
  }
  return submitted.model
}

describe('An editor over a declared write', () => {
  it('names only the keys the author changed, and shows them before the server answers', async () => {
    const renamed = form(
      await opened(),
      EditProjectForm.Message.Changed({ key: 'name', value: 'Apollo II' }),
    )
    const saving = await saved(renamed)

    expect(sent.map(request => request.keys)).toEqual([['name']])
    expect(shown(saving)).toEqual({ id: 'p1', name: 'Apollo II', status: 'active' })
  })

  it('names no key it was not filled with: something new is written whole', async () => {
    const blank = Placed.helpers.blank()(initial).model
    const typed = form(
      form(
        form(blank, EditProjectForm.Message.Changed({ key: 'id', value: 'p2' })),
        EditProjectForm.Message.Changed({ key: 'name', value: 'New' }),
      ),
      EditProjectForm.Message.Changed({ key: 'status', value: 'draft' }),
    )
    await saved(typed)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.keys).toBeUndefined()
  })

  it('names a key changed back to what it was filled with as unchanged', async () => {
    const away = form(await opened(), EditProjectForm.Message.Changed({ key: 'name', value: 'X' }))
    const back = form(away, EditProjectForm.Message.Changed({ key: 'name', value: 'Apollo' }))
    await saved(form(back, EditProjectForm.Message.Changed({ key: 'status', value: 'archived' })))

    expect(sent.map(request => request.keys)).toEqual([['status']])
  })
})

describe('An editor over a write that expects a revision', () => {
  const Doc = Entity.define(
    'Doc',
    Schema.Struct({ id: Schema.String, title: Schema.String, revision: Schema.Number }),
  )
  const EditDocInput = Entity.input(
    Doc,
    Schema.Struct({ id: Schema.String, title: Schema.String, revision: Schema.Number }),
  )
  const EditDoc = Mutation.write(
    'EditDoc',
    Write.update(EditDocInput, { id: 'id', expect: 'revision' }),
  )
  const DocForm = Form.make('EditDoc', EditDocInput, {
    // A hidden control holds text; the revision is a number, so it keeps its own control.
    inputs: { id: Input.hidden() },
    debounce: 0,
  })
  const DocEditor = Crud.editor('DocEditor', { form: DocForm, mutation: EditDoc })
  const DocSlot = Bundle.declare(DocEditor.bundle, 'editor')
  const DocModel = Schema.Struct({ remote: Remote.Model, ...DocSlot.fields })
  type DocModel = typeof DocModel.Type
  const DocMessage = defineMessageUnion({ ...Remote.messages, ...DocSlot.cases })
  type DocMessage = typeof DocMessage.Type
  const DocApp = Surface.application({ Model: DocModel, Message: DocMessage })
  const Docs = Remote.make({ model: DocApp.model.remote, entities: [Doc], mutations: [EditDoc] })
  const Placed = DocEditor.at({ data: Docs, model: DocApp.model.editor })
  const DocPage = Bundle.parent({
    Model: DocModel,
    Message: DocMessage,
  }).withServices<RemoteClient>()
  const DocPlaced = DocPage.at(DocSlot, { onOut: Placed.onOut })
  const docPlacements = DocPage.assemble(DocPlaced)
  const docUpdate = Placed.after(
    docPlacements.update((model: DocModel, message: DocMessage) =>
      Remote.reduces(message) ? { model: Docs.reduce(model, message) } : { model },
    ),
  )

  /** The server's row, and the revisions each save was sent with. */
  let doc = { id: 'd1', title: 'Draft', revision: 1 }
  let sentRevisions: Array<unknown> = []
  const DocClient = Layer.succeed(RemoteClient, {
    read: batch =>
      Effect.sync(() => ({
        settled: [],
        entities: batch.requests.map(request => ({ entity: 'Doc', id: request.id, values: doc })),
      })),
    query: () => Effect.die('no queries'),
    mutate: request =>
      Effect.sync(() => {
        const input = request.input as typeof doc
        sentRevisions.push(input.revision)
        doc = { ...doc, title: input.title, revision: doc.revision + 1 }
        return { output: {}, entities: [{ entity: 'Doc', id: 'd1', values: doc }] }
      }),
    live: () => Stream.empty,
  })
  beforeEach(() => {
    doc = { id: 'd1', title: 'Draft', revision: 1 }
    sentRevisions = []
  })

  const run = async (model: DocModel, message: DocMessage): Promise<DocModel> => {
    const next = docUpdate(model, message)
    let current = next.model
    for (const command of next.commands ?? []) {
      const settled = await Effect.runPromise(command.effect.pipe(Effect.provide(DocClient)))
      current = await run(current, settled as DocMessage)
    }
    return current
  }
  const edit = (model: DocModel, message: typeof DocForm.Message.Type) =>
    run(model, DocMessage.GotEditorMessage({ message }))
  const openedDoc = async (): Promise<DocModel> => {
    const open = DocPlaced.helpers.open('d1')({
      remote: Remote.initial,
      editor: DocEditor.bundle.init().model,
    }).model
    const projection = Option.getOrThrow(Placed.active.projectionOf(open))
    const loaded = await Effect.runPromise(
      Docs.prefetch(open, projection).pipe(Effect.provide(DocClient)),
    )
    return Placed.sync(loaded).model
  }
  /** Another client's save of the row, as a read of it would bring. */
  const savedElsewhere = (model: DocModel, revision: number): DocModel =>
    Placed.sync(
      Docs.reduce(model, {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Doc', id: 'd1', fields: ['id', 'title', 'revision'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Doc', id: 'd1', values: { id: 'd1', title: 'Theirs', revision } }],
        },
        now: 1,
      }),
    ).model

  it('takes the revision its own save moved the row to, so its next save is not a conflict', async () => {
    const first = await edit(
      await openedDoc(),
      DocForm.Message.Changed({ key: 'title', value: 'One' }),
    )
    const saved = await edit(first, DocForm.Message.Submitted())
    expect(Placed.status(saved)).toBe('Saved')
    const again = await edit(saved, DocForm.Message.Changed({ key: 'title', value: 'Two' }))
    expect(Placed.status(again)).toBe('Editing')
    await edit(again, DocForm.Message.Submitted())
    expect(sentRevisions).toEqual([1, 2])
  })

  it('reads Moved when someone else saved the row, and keeps the draft', async () => {
    const typed = await edit(
      await openedDoc(),
      DocForm.Message.Changed({ key: 'title', value: 'Mine' }),
    )
    const moved = savedElsewhere(typed, 2)
    expect(Placed.status(moved)).toBe('Moved')
    expect(DocForm.field(moved.editor.form, 'title').value).toBe('Mine')
  })
})
