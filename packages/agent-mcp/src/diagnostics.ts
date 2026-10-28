/**
 * What an MCP host answers past without telling the client why: a defect in
 * the application's `authenticate`, a capability, a request's handling or the
 * tool listing, answered generically, and a client transport that broke while
 * its session ended. Each goes to the host's `diagnostics` reporter.
 */
import { Effect } from 'effect'
import { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'

const source = 'foldkit-agent-mcp'

/** `authenticate` died or threw; the request was answered 500 and the client told nothing of it. */
export interface AuthenticateDefect extends Diagnostic {
  readonly _tag: 'AuthenticateDefect'
  readonly cause: unknown
}

/** A capability's dispatch died; the call was answered a tool error naming no cause. */
export interface CapabilityDefect extends Diagnostic {
  readonly _tag: 'CapabilityDefect'
  readonly capability: string
  readonly cause: unknown
}

/** Handling a request threw (a projection, a resource read); it was answered an internal error. */
export interface RequestDefect extends Diagnostic {
  readonly _tag: 'RequestDefect'
  readonly method: string
  readonly cause: unknown
}

/** Listing the available tools threw while the Model changed, so no `tools/list_changed` was sent. */
export interface ToolListDefect extends Diagnostic {
  readonly _tag: 'ToolListDefect'
  readonly cause: unknown
}

/** A client transport's `end` threw while its session was dropped; the session ended regardless. */
export interface TransportEndDefect extends Diagnostic {
  readonly _tag: 'TransportEndDefect'
  readonly sessionId: string
  readonly cause: unknown
}

/** Every diagnostic `foldkit-agent-mcp` reports. */
export type AgentMcpDiagnostic =
  | AuthenticateDefect
  | CapabilityDefect
  | RequestDefect
  | ToolListDefect
  | TransportEndDefect

const described = (cause: unknown): string =>
  cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)

export const authenticateDefect = (cause: unknown): AuthenticateDefect => ({
  _tag: 'AuthenticateDefect',
  source,
  level: 'error',
  message: `authenticate broke, and the request was answered 500\n${described(cause)}`,
  cause,
})

export const capabilityDefect = (capability: string, cause: unknown): CapabilityDefect => ({
  _tag: 'CapabilityDefect',
  source,
  level: 'error',
  message: `the capability "${capability}" failed unexpectedly, and the call was answered a tool error with no cause\n${described(cause)}`,
  capability,
  cause,
})

export const requestDefect = (method: string, cause: unknown): RequestDefect => ({
  _tag: 'RequestDefect',
  source,
  level: 'error',
  message: `handling ${method} broke, and it was answered an internal error\n${described(cause)}`,
  method,
  cause,
})

export const toolListDefect = (cause: unknown): ToolListDefect => ({
  _tag: 'ToolListDefect',
  source,
  level: 'error',
  message: `listing the available tools broke after the Model changed, so the client was not told the list changed\n${described(cause)}`,
  cause,
})

export const transportEndDefect = (sessionId: string, cause: unknown): TransportEndDefect => ({
  _tag: 'TransportEndDefect',
  source,
  level: 'warning',
  message: `a client transport broke as session ${sessionId} ended; the session ended regardless\n${described(cause)}`,
  sessionId,
  cause,
})

/**
 * Reports `diagnostic` to `reporter`, or to the `Diagnostics.Reporter` default
 * when none is given. The host is Promise-based and runs outside any Effect
 * context of the application's, so the reporter is an option, not a service.
 */
export const reportTo =
  (reporter: ReportDiagnostic | undefined) =>
  (diagnostic: AgentMcpDiagnostic): Promise<void> =>
    Effect.runPromise(
      reporter === undefined
        ? Diagnostics.report(diagnostic)
        : Effect.provideService(Diagnostics.report(diagnostic), Diagnostics.Reporter, reporter),
    )
