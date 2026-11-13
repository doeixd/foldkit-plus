/**
 * The agent's context is a Surface declared closed. A walk over the application's Messages
 * checks, at every step, that the notes and the selection depend on nothing outside them and
 * that only the Messages the Surface lists move them.
 */
import { Option } from 'effect'
import { Closure } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { AppAgent } from '../src/agent.js'
import { AgentContext, App, Message, type Model } from '../src/stack.js'

const violations = Closure.violations(App, [AgentContext])

/** One step of the walk: the Messages go in order, each from the Model the last one left. */
const walk = (messages: ReadonlyArray<Message>, start: Model = App.initial) => {
  let model = start
  return messages.flatMap(message => {
    const before = model
    model = App.update(before, message).model
    return violations(before, message, model)
  })
}

const messages: ReadonlyArray<Message> = [
  Message.RequestedCreateNote({ id: 'n1', body: 'first' }),
  Message.SelectedProject({ id: 'p2' }),
  Message.Ping(),
  Message.SelectedNote({ id: 'n1' }),
  Message.RequestedRenameNote({ id: 'n1', body: 'renamed' }),
  Message.RequestedCreateNote({ id: 'n1', body: 'taken' }),
  Message.SelectedProject({ id: 'p1' }),
]

describe('The agent context Surface', () => {
  it('is declared closed and is the context the agent reads', () => {
    expect(AgentContext.closed).toBe(true)
    expect(AppAgent.context.read(App.initial)).toEqual(
      AgentContext.projection(undefined).read(App.initial),
    )
  })

  it('is closed under every Message of the walk', () => {
    expect(walk(messages)).toEqual([])
  })

  it('is closed from a Model whose other fields are not at their initial values', () => {
    const away: Model = { ...App.initial, projectId: 'p9', selectedNoteId: Option.some('n0') }
    expect(walk(messages, away)).toEqual([])
  })

  it('finds a Message outside its set that moves a note', () => {
    const before = App.initial
    const after = { ...before, notes: [{ id: 'n1', body: 'sneaked' }] }
    expect(violations(before, Message.Ping(), after)).toEqual([
      { surface: 'AgentContext', kind: 'outside' },
    ])
  })
})
