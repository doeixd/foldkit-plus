/**
 * The agent contract for the kitchen-sink application.
 *
 * It reuses the application's own Messages: every capability is a Message
 * `update` already knows how to handle, and every read is a Surface projection.
 * The adapters (`foldkit-agent-webmcp`, `-mcp`, `-a2a`, `-native`) turn this one
 * contract into their respective surfaces.
 */
import { Agent } from 'foldkit-agent'
import { Projection, Surface } from 'foldkit-surface'
import { Schema } from 'effect'
import { App, Data, Message, ProjectSummary, ProjectsByOwner } from './stack.js'

/** Who is calling the agent. A real application resolves this from a session. */
export interface AgentPrincipal {
  readonly canWrite: boolean
}

const BoardAgent = Agent.forApplication(App).withPrincipal<AgentPrincipal>()

/**
 * A named query, given to the agent as a read capability
 * ([data-query-DESIGN §29.2](../../../docs/design/data-query-DESIGN.md)).
 *
 * The agent is handed *this list*, not a database and not a query language: the
 * application chose the definition, the input and the Selection, so the only
 * question it can ask is the one written here. There is no `Expr` on this side
 * of the boundary at all.
 *
 * It reads the Model, which is the other half of why this is safe. A value is
 * there because an active Surface fetched it, and the server authorized that
 * fetch — so the agent sees what the application already had, and being asked
 * cannot cause a read the principal was not entitled to. Before anything is
 * loaded it reads `Initial`, which is an honest answer and not an error.
 */
const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

export const AppAgent = BoardAgent.make({
  // What an agent may see: the replicated notes and the current selection.
  context: Projection.pick(App.model.notes, App.model.selectedNoteId),

  messages: BoardAgent.expose(Message, {
    RequestedCreateNote: 'Create a note',
    RequestedRenameNote: { name: 'rename_note', description: 'Rename an existing note' },
    SelectedNote: 'Select a note, making the capabilities that act on one available',
  }),

  // A Projection is already what a resource wants: a schema and a pure read of
  // the Model. No bridge was needed between the two packages.
  resources: [
    Agent.resource('projects', {
      description: "The owner's projects, as the board has them",
      schema: projects.Model,
      read: projects.read,
    }),
  ],
})

export const bindAgent = BoardAgent.bind
