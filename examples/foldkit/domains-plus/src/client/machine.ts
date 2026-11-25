/**
 * Declared transitions for `domains-plus` (Phase 3, Bout 3.4).
 *
 * The 19 Messages declarable without widget lifts or custom operations live
 * here as one `metakit/machine` Machine; `app.ts` joins them to their Command
 * table and `fallback` via `Declared.of`.
 */
import { Schema } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Cart } from './domain'
import { ResultsListScrollKey } from './resultsList.js'
import type { Model as ModelType } from './app.js'

/**
 * Build the `domains-plus` Machine over `ModelSchema` (passed in from `app.ts`
 * to avoid a circular runtime dependency between `app.ts` and `machine.ts`).
 */
export const makeDomainsMachine = (ModelSchema: Schema.Codec<ModelType, unknown>) => {
  const emptyInput = Schema.Struct({})
  const noop = Transition.make({
    state: ModelSchema,
    input: emptyInput,
    apply: () => [],
  })

  return Machine.make({
    state: ModelSchema,
    transitions: {
      // 13 no-change, no-Command Messages
      CompletedFocusCartButton: noop,
      CompletedFocusCartCloseButton: noop,
      CompletedFocusFiltersButton: noop,
      CompletedFocusTldFilterButton: noop,
      CompletedRevealResultsListStart: noop,
      CompletedScrollPage: noop,
      CompletedNavigateInternal: noop,
      CompletedLoadExternal: noop,
      CompletedFocusSearchInput: noop,
      CompletedDismissSearchKeyboard: noop,
      CompletedScrollPageToTop: noop,
      ClickedDomainsHome: noop,
      ClickedSkipToMain: noop,

      // 3 Command-only Messages
      FocusedResultsList: Transition.make({
        state: ModelSchema,
        input: emptyInput,
        apply: () => [],
        emits: () => [Transition.emit('RevealResultsListStart', {})],
      }),
      PressedResultsListScrollKey: Transition.make({
        state: ModelSchema,
        input: Schema.Struct({ key: ResultsListScrollKey }),
        apply: () => [],
        emits: ({ input }) => [Transition.emit('ScrollPage', { key: input.key })],
      }),
      ClickedLink: Transition.make({
        state: ModelSchema,
        input: Schema.Struct({ request: UrlRequest }),
        apply: () => [],
        emits: ({ input }) => [Transition.emit('FollowLink', { request: input.request })],
      }),

      // 3 field-write Messages
      UpdatedTldSearch: Transition.make({
        state: ModelSchema,
        input: Schema.Struct({ value: Schema.String }),
        apply: ({ state, input }) => [Transition.set(state.tldSearchQuery, input.value)],
      }),
      ClickedRemoveDomain: Transition.make({
        state: ModelSchema,
        input: Schema.Struct({ name: Cart.Name }),
        apply: ({ state, input }) => [Transition.remove(state.cart, input.name, { key: 'name' })],
      }),
      ClickedRemoveCartDomain: Transition.make({
        state: ModelSchema,
        input: Schema.Struct({ name: Cart.Name }),
        apply: ({ state, input }) => [Transition.remove(state.cart, input.name, { key: 'name' })],
        emits: () => [Transition.emit('FocusCartCloseButton', {})],
      }),
    },
  })
}

export type DomainsMachine = ReturnType<typeof makeDomainsMachine>
