/**
 * Compile-time expectations. Type-checked, not executed: every
 * `@ts-expect-error` below must stay an error for the contract to hold.
 */
import type { Agent } from 'foldkit-agent'
import { AgentMcp } from 'foldkit-agent-mcp'

declare const agent: Agent.AgentRuntime<any, any, any, any, any>
declare const createAgent: () => typeof agent
declare const server: ReturnType<typeof AgentMcp.httpHandler>

// A reused handler is enough on its own.
AgentMcp.httpApp({ server })
AgentMcp.httpApp({ createAgent })
AgentMcp.httpApp({
  server,
  // @ts-expect-error a reused handler would ignore the options to create one.
  createAgent,
})

// stdio needs only the stream methods it calls, which the process streams have.
AgentMcp.stdio({ agent, input: process.stdin, output: process.stdout })
AgentMcp.stdio({
  agent,
  input: { on: () => undefined, off: () => undefined },
  output: { write: () => undefined },
})
AgentMcp.stdio({
  agent,
  // @ts-expect-error an input that cannot be detached cannot be closed.
  input: { on: () => undefined },
})
