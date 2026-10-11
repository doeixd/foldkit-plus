/**
 * One editor for create and edit: its input's id is an `Option`, so a blank
 * form saves with none and an opened one with the id it was filled with.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { beforeEach, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const SaveProjectInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.OptionFromNullOr(Schema.String), name: Schema.String }),
)
const SaveProject = Mutation.make('SaveProject', {
  Input: SaveProjectInput.schema,
  Output: { id: Schema.String },
})
const SaveProjectForm = Form.make('SaveProject', SaveProjectInput, {
  inputs: { id: Input.hidden() },
  debounce: 0,
})
const Editor = Crud.editor('ProjectEditor', { form: SaveProjectForm, mutation: SaveProject })
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [SaveProject] })
const ProjectEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: ProjectEditor.onOut })
const update = ProjectEditor.after(
  Page.assemble(Placed).update((model: Model, message: Message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

/** The inputs the server was sent, as the wire carries them. */
let sent: Array<unknown> = []
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: 'Project',
        id: request.id,
        values: { id: request.id, name: 'Apollo' },
      })),
    })),
  query: () => Effect.die('no queries'),
  mutate: request =>
    Effect.sync(() => {
      sent.push(request.input)
      return { output: { id: 'p9' }, entities: [] }
    }),
  live: () => Stream.empty,
})
beforeEach(() => {
  sent = []
})

const initial: Model = { remote: Remote.initial, editor: Editor.bundle.init().model }
const form = (model: Model, message: typeof SaveProjectForm.Message.Type) =>
  update(model, Message.GotEditorMessage({ message })).model
const saved = async (model: Model) => {
  const submitted = update(
    model,
    Message.GotEditorMessage({ message: SaveProjectForm.Message.Submitted() }),
  )
  for (const command of submitted.commands ?? []) {
    await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))
  }
}

it('saves a blank form with no id, and an opened one with its own', async () => {
  const blank = Placed.helpers.blank()(initial).model
  await saved(form(blank, SaveProjectForm.Message.Changed({ key: 'name', value: 'New' })))

  const open = Placed.helpers.open('p1')(initial).model
  const projection = Option.getOrThrow(ProjectEditor.active.projectionOf(open))
  const loaded = ProjectEditor.sync(
    await Effect.runPromise(Data.prefetch(open, projection).pipe(Effect.provide(Client))),
  ).model
  await saved(form(loaded, SaveProjectForm.Message.Changed({ key: 'name', value: 'Apollo II' })))

  expect(sent).toEqual([
    { id: null, name: 'New' },
    { id: 'p1', name: 'Apollo II' },
  ])
})
