import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteData } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

// The domain, declared once: the client caches it, the server reads it.
const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, owner: Schema.String }),
)
const ProjectName = Entity.select(Project, { id: true, name: true })

// Server facts live in the Model, under one field, reduced by update.
const Model = Schema.Struct({ remote: Remote.Model })
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })

// A Surface asks for what it shows; Remote fetches it. The read does no I/O.
export const ProjectPage = App.surface('ProjectPage', {
  params: { id: Schema.String },
  model: ({ params }) => ({ project: Data.get(ProjectName, params.id) }),
})

export const heading = (project: RemoteData<{ readonly name: string }>) =>
  RemoteData.match(project, {
    Initial: () => '',
    Loading: () => 'Loading…',
    Ready: ({ name }) => name,
    Refreshing: ({ name }) => name,
    Failed: error => error.message,
    NotFound: () => 'No such project',
  })
