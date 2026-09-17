/**
 * DOM mutations as a Mount: MutationObserver reports child, attribute, and
 * text changes as Messages for the element carrying this Mount. Nodes cross
 * as their names (serializable); the live nodes stay in the DOM, never in
 * the Model. No observer (SSR, old browser) emits nothing instead of
 * throwing. Observes the whole subtree — narrow by placing on a smaller
 * element, not by options.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const Mutated = Schema.TaggedStruct('Mutated', {
  type: Schema.Literals(['childList', 'attributes', 'characterData']),
  added: Schema.Array(Schema.String),
  removed: Schema.Array(Schema.String),
  attribute: Schema.NullOr(Schema.String),
})
export type Mutated = typeof Mutated.Type

type ObserverCtor = new (callback: MutationCallback) => MutationObserver

const recordType = (type: string): Mutated['type'] | null =>
  type === 'childList' || type === 'attributes' || type === 'characterData' ? type : null

export const Mutation = Mount.defineStream('Mutation', {
  messages: [Mutated],
  execute: ({ element }) =>
    Stream.callback<typeof Mutated.Type>(queue =>
      Effect.gen(function* () {
        const Observed = (globalThis as { MutationObserver?: ObserverCtor }).MutationObserver
        if (Observed === undefined) return
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new Observed(records => {
              for (const record of records) {
                const type = recordType(record.type)
                if (type === null) continue
                Queue.offerUnsafe(
                  queue,
                  Mutated.make({
                    type,
                    added:
                      type === 'childList'
                        ? Array.from(record.addedNodes, node => node.nodeName)
                        : [],
                    removed:
                      type === 'childList'
                        ? Array.from(record.removedNodes, node => node.nodeName)
                        : [],
                    attribute: type === 'attributes' ? (record.attributeName ?? null) : null,
                  }),
                )
              }
            })
            observer.observe(element, {
              childList: true,
              attributes: true,
              characterData: true,
              subtree: true,
            })
            return observer
          }),
          observer => Effect.sync(() => observer.disconnect()),
        )
      }),
    ),
})
