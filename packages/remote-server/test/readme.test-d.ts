import { Effect, Schema } from 'effect'
import { Entity, Remote, RemoteRpc } from 'foldkit-remote'
import { RemoteServer } from '../src/index.js'

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    privateNotes: Schema.String,
  }),
)

// Your authentication's principal type; without it `principal` is `unknown`.
type Principal = { readonly isAdmin: boolean }

const rows = new Map([['p1', { id: 'p1', name: 'Apollo', privateNotes: 'Internal' }]])

const ProjectSource = RemoteServer.entity<Principal>(Project, {
  // Authentication already resolved `principal` before RemoteServer sees it.
  // Return only fields this caller may read.
  authorize: (principal, fields) =>
    fields.filter(field => field !== 'privateNotes' || principal.isAdmin),

  read: ({ ids, fields }) =>
    Effect.succeed(
      ids.flatMap(id => {
        const row = rows.get(id)
        return row === undefined
          ? []
          : [
              {
                id,
                values: Object.fromEntries(
                  Object.entries(row).filter(([field]) => fields.includes(field)),
                ),
              },
            ]
      }),
    ),
})

const Server = RemoteServer.make({
  entities: [ProjectSource],
})

const principal: Principal = { isAdmin: false }
const handlers = RemoteServer.handlers(Server, principal)
const layer = RemoteRpc.toLayer(handlers)

void layer
