/**
 * Compile-time expectations. Type-checked, not executed: every
 * `@ts-expect-error` below must stay an error for the contract to hold.
 */
import { Schema } from 'effect'
import type { StandardJSONSchemaV1, StandardSchemaV1 } from 'effect/StandardSchema'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { AgentNative, type ActionEntry } from 'foldkit-agent-native'

const Message = defineMessageUnion({ SetLimit: { value: Schema.Number } })
const definition = Agent.make({
  messages: Agent.expose(Message, { SetLimit: { name: 'set_limit', description: 'Set' } }),
})
declare const runtime: Agent.AgentRuntime<any, any, any, any, any>

// A contract's capability names are the registry's keys.
const registry = AgentNative.actions({ definition, resolveRuntime: () => runtime })
export const entry: ActionEntry = registry.set_limit
// @ts-expect-error `remove_limit` is not a capability of this contract.
export const missing = registry.remove_limit

// A definition with open names still yields an open registry.
declare const open: Agent.Definition<any, any, any, any, any>
export const opened: ActionEntry | undefined = AgentNative.actions({
  definition: open,
  resolveRuntime: () => runtime,
})['anything']

// The schema both validates and advertises, and says so in its type.
export const converter: StandardJSONSchemaV1.Converter = entry.schema['~standard'].jsonSchema
declare const validationOnly: StandardSchemaV1<unknown, unknown>
// @ts-expect-error a validation-only schema advertises no parameters.
export const advertised: ActionEntry['schema'] = validationOnly
