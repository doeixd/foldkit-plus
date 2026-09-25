/**
 * Actions on a page: what a Block's events do.
 *
 * A Button must eventually do something, and the rule `foldkit-agent` keeps
 * holds here: a capability ends in an existing Message. A Catalog lists the
 * actions its Documents may reference, each a `foldkit-surface` Action or
 * anything shaped like one, and a node stores only which action an event runs
 * and its input, as literals: `{ press: { action: 'addToCart', input: { … } } }`.
 * No stored value executes; the input is decoded by the action's own Schema
 * before its Message is made, and `update` stays the only place a Message has
 * effects.
 */
import { Result, Schema } from 'effect'
import { isRecord, type AnyBlock } from './block.js'

/** An action a Catalog offers: what `Action.define` from `foldkit-surface` makes. */
export interface CatalogAction {
  readonly name: string
  readonly description: string
  readonly input: Schema.Top
  // Method syntax: an Action of a specific input is still one.
  toMessage(input: never): unknown
}

/** What a node stores for one event: the action's name, and its input as JSON. */
export const ActionRef = Schema.Struct({
  action: Schema.String,
  input: Schema.optional(Schema.Json),
})
export type ActionRef = typeof ActionRef.Type

/** Something wrong with a node's stored actions, at a path inside the node. */
export interface ActionFinding {
  readonly code: 'composition:invalid-action' | 'composition:unknown-action'
  readonly path: ReadonlyArray<string>
  readonly message: string
}

const decodeRef = Schema.decodeUnknownResult(ActionRef)

/** The input an action is given, decoded by its Schema, or why it is refused. */
const inputOf = (action: CatalogAction, ref: ActionRef) =>
  // An action's input needs no services to decode: it is a Schema of stored JSON.
  Schema.decodeUnknownResult(action.input as Schema.Codec<unknown, unknown>)(ref.input ?? {})

/** What is wrong with a node's stored actions, against its Block's events and the Catalog's actions. */
export const checkActions = (
  actions: ReadonlyArray<CatalogAction>,
  block: AnyBlock,
  stored: unknown,
): ReadonlyArray<ActionFinding> => {
  if (stored === undefined) return []
  if (!isRecord(stored))
    return [
      {
        code: 'composition:invalid-action',
        path: ['actions'],
        message: 'is not a record of actions by event',
      },
    ]
  return Object.entries(stored).flatMap(([event, value]): ReadonlyArray<ActionFinding> => {
    const path = ['actions', event]
    if (!block.events.includes(event))
      return [
        {
          code: 'composition:invalid-action',
          path,
          message: `a ${block.name} has no event "${event}"`,
        },
      ]
    const ref = decodeRef(value)
    if (Result.isFailure(ref))
      return [
        {
          code: 'composition:invalid-action',
          path,
          message: 'is not an { action, input } reference',
        },
      ]
    const action = actions.find(each => each.name === ref.success.action)
    if (action === undefined)
      return [
        {
          code: 'composition:unknown-action',
          path,
          message: `"${ref.success.action}" is not an action this Catalog offers`,
        },
      ]
    const input = inputOf(action, ref.success)
    return Result.isFailure(input)
      ? [
          {
            code: 'composition:invalid-action',
            path,
            message: `"${action.name}" refuses its input: ${input.failure.message}`,
          },
        ]
      : []
  })
}

/**
 * The Message the action an event references makes, or `undefined` when the
 * node references none for it, or one that does not check.
 */
export const messageOf = (
  actions: ReadonlyArray<CatalogAction>,
  block: AnyBlock,
  stored: unknown,
  event: string,
): unknown => {
  if (!isRecord(stored) || !block.events.includes(event)) return undefined
  const ref = decodeRef(stored[event])
  if (Result.isFailure(ref)) return undefined
  const action = actions.find(each => each.name === ref.success.action)
  if (action === undefined) return undefined
  const input = inputOf(action, ref.success)
  // The input was decoded by this action's own Schema.
  return Result.isFailure(input) ? undefined : action.toMessage(input.success as never)
}
