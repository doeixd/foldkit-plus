/**
 * An agent that edits the page, through the same path a person does: its one
 * capability sends the Builder's own `Applied` Message, carried by the form
 * and the editor, so an agent's edit is checked, undoable, autosaved and
 * revisioned like any other. It sees the page as an outline, ids included, so
 * it can name where an edit goes, and it mints the ids of what it adds.
 */
import { Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { Message as BuilderMessage } from 'foldkit-builder'
import { Composition } from 'foldkit-composition'
import { Projection } from 'foldkit-surface'
import { Message, editing, type Model } from './pageApp.js'
import { PageForm } from './pageDomain.js'
import { Site } from './site.js'

/** What the agent sees: the page as indented text, one node a line, with its id. */
const PageOutline = Projection.fromReader(
  Schema.Struct({ outline: Schema.String }),
  (model: Model) => ({ outline: Composition.describe(Site, editing(model)) }),
)

export const PageAgent = Agent.make({
  context: PageOutline,
  messages: Agent.expose(Message, {
    GotEditorMessage: Agent.variant({
      name: 'edit_page',
      description: 'Insert, move, remove or configure blocks on the page',
      // Block names are literals here, so a Block outside the Catalog is refused
      // by the tool's own input schema.
      input: Composition.operationSchema(Site),
      toMessage: op => ({
        message: PageForm.control('document').send(BuilderMessage.Applied({ op })),
      }),
    }),
  }),
})
