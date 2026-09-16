/**
 * An agent contract's wiring joins an assembly contract-only, so the Module
 * sees it. An agent adds no state and no Subscriptions.
 */
import { Surface, type Wiring } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { Message as MessageUnion, Model, emptyModel, type Message } from './todoApp.js'

const update = (model: Model, _message: Message) => ({ model })

const App = Surface.application({ Model, Message: MessageUnion, initial: emptyModel, update })
const TodoAgent = Agent.forApplication(App)

describe('agent contract wiring', () => {
  it('joins an assembly contract-only, for the Module', () => {
    const definition = TodoAgent.make({
      name: 'assistant',
      messages: TodoAgent.expose(MessageUnion, { RequestedDeleteTodo: 'Delete' }),
    })
    const wiring = definition.wiring()
    const asWiring: Wiring<Model, never> = wiring
    expect(asWiring.key).toBe('agent:assistant')
    expect(asWiring.handles).toEqual([])
    expect(asWiring.contract).toBe(definition.contract)
    expect(asWiring.route).toBeUndefined()
    expect(asWiring.init).toBeUndefined()
    expect(asWiring.onUrl).toBeUndefined()
    expect(asWiring.subscriptions).toBeUndefined()
    expect(asWiring.resources).toBeUndefined()
  })

  it('names the wiring after the contract by default', () => {
    const definition = TodoAgent.make({
      messages: TodoAgent.expose(MessageUnion, {}),
    })
    expect(definition.wiring().key).toBe('agent:agent')
  })
})
