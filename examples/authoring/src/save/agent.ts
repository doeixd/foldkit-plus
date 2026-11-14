/**
 * What an agent may do to the editor, and which control each thing is. Saving
 * completes on Remote's fact for the request it caused, correlated by the
 * invocation's id, so the agent's call resolves on the server's answer and not
 * on the dispatch.
 */
import { Option, Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { Projection } from 'foldkit-surface'
import { App, Message } from './app.js'

const EditorAgent = Agent.forApplication(App)

export const AppAgent = EditorAgent.make({
  context: Projection.pick(App.model.draft),
  messages: EditorAgent.expose(Message, {
    ChangedDraft: { name: 'set_title', description: 'Set the title being edited' },
    RequestedSave: {
      name: 'save',
      description: 'Save the title',
      input: Schema.Struct({}),
      toMessage: (_input, { invocation }) => ({ requestId: Option.some(invocation.id) }),
      completion: {
        success: Message.MutationSucceeded,
        failure: Message.MutationFailed,
        correlate: (_request, result, { invocation }) => result.requestId === invocation.id,
        timeout: '5 seconds',
      },
    },
  }),
})

export const Parts = EditorAgent.parts(AppAgent, {
  title: Agent.part({
    label: 'Title',
    role: 'textbox',
    field: 'draft',
    sets: Message.ChangedDraft,
  }),
  save: Agent.part({ label: 'Save', role: 'button', invokes: Message.RequestedSave }),
})

export const bindAgent = EditorAgent.bind
