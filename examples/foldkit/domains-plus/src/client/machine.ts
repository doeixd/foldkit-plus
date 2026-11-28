/**
 * Declared transitions for `domains-plus` (Phase 3, Bouts 3.4 & 3.5).
 *
 * 30 of the 39 own Messages are declared as one `@doeixd/metakit/machine` Machine
 * (meeting the three-in-four Phase 3 gate). The remaining 9 stay in `fallback`:
 *   - 3 upstream Listbox Messages (`GotTldListboxMessage`, `GotAvailabilityListboxMessage`, `GotSortListboxMessage`): upstream `@foldkit/ui/listbox` has no machine.
 *   - 5 search/address Messages (`UpdatedSearch`, `PressedEscape`, `ClickedClearSearch`, `ClickedRetrySearch`, `ChangedUrl`): call debounce `update`, `Data.refresh`, and `routeOf`.
 *   - 1 `ClickedAddDomain`: reads Remote's `Quote` store entry by name.
 */
import { Array, Option, Schema } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { Sheet, WindowList } from 'foldkit-mixins-ui'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Operation from '@doeixd/metakit/operation'
import { Domain as DomainCase, DomainLabel, queryToMaybeDomainLabel } from '../shared/domain'
import { AvailabilityFilter, Cart, SortOrder, TldFilter } from './domain'
import { ResultsListScrollKey } from './resultsList.js'
import type { Model as ModelType } from './app.js'

const parseDomainLabelOp = Operation.define({
  id: 'domains.parseDomainLabel',
  version: 1,
  args: [Schema.String],
  returns: Schema.NullOr(DomainLabel),
  nulls: 'own',
})

/** Foreign implementations for `domains-plus`'s custom operations. */
export const domainsForeign = Operation.implementations(
  'domains-plus',
  Operation.implement(parseDomainLabelOp, query =>
    query === null ? null : Option.getOrNull(queryToMaybeDomainLabel(query)),
  ),
)

/**
 * Build the `domains-plus` Machine over `ModelSchema` (passed in from `app.ts`
 * to avoid a circular runtime dependency between `app.ts` and `machine.ts`).
 */
export const makeDomainsMachine = (
  ModelSchema: Schema.Codec<ModelType, unknown>,
  readAvailableQuote?: (
    model: ModelType,
    name: string,
  ) => Option.Option<typeof DomainCase.Available.Type>,
) => {
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

      // 1 search-label Message (custom Operation.define)
      SubmittedSearch: Transition.make({
        state: ModelSchema,
        input: emptyInput,
        apply: ({ state }) => [Transition.set(state.settledLabel, parseDomainLabelOp(state.query))],
        emits: () => [Transition.emit('DismissSearchKeyboard', {})],
      }),

      // 6 sheet open/close Messages (backed by Sheet.open / Sheet.close)
      ClickedFilters: Transition.opaque({
        name: 'domains.ClickedFilters',
        state: ModelSchema,
        input: emptyInput,
        reads: ({ state }) => [state.filtersSheet],
        writes: ({ state }) => [state.filtersSheet],
        run: model => {
          const next = Sheet.open(model.filtersSheet).model
          return next === model.filtersSheet
            ? model
            : modifyFields(model, { filtersSheet: () => next })
        },
        emits: ({ state }) => [Transition.emit('OpenFiltersSheet', { sheet: state.filtersSheet })],
      }),
      ClickedMobileAvailabilityOption: Transition.opaque({
        name: 'domains.ClickedMobileAvailabilityOption',
        state: ModelSchema,
        input: Schema.Struct({ value: AvailabilityFilter }),
        reads: ({ state, input }) => [state.filtersSheet, input.value],
        writes: ({ state }) => [state.availabilityFilter, state.filtersSheet],
        run: (model, { value }) => {
          const next = Sheet.close(model.filtersSheet).model
          return modifyFields(model, {
            availabilityFilter: () => value,
            filtersSheet: () => next,
          })
        },
        emits: ({ state }) => [Transition.emit('CloseFiltersSheet', { sheet: state.filtersSheet })],
      }),
      ClickedMobileSortOption: Transition.opaque({
        name: 'domains.ClickedMobileSortOption',
        state: ModelSchema,
        input: Schema.Struct({ value: SortOrder }),
        reads: ({ state, input }) => [state.filtersSheet, input.value],
        writes: ({ state }) => [state.sortOrder, state.filtersSheet],
        run: (model, { value }) => {
          const next = Sheet.close(model.filtersSheet).model
          return modifyFields(model, {
            sortOrder: () => value,
            filtersSheet: () => next,
          })
        },
        emits: ({ state }) => [Transition.emit('CloseFiltersSheet', { sheet: state.filtersSheet })],
      }),
      ClickedTldFilter: Transition.opaque({
        name: 'domains.ClickedTldFilter',
        state: ModelSchema,
        input: emptyInput,
        reads: ({ state }) => [state.tldSheet],
        writes: ({ state }) => [state.tldSearchQuery, state.tldSheet],
        run: model => {
          const next = Sheet.open(model.tldSheet).model
          return modifyFields(model, {
            tldSearchQuery: () => '',
            tldSheet: () => next,
          })
        },
        emits: ({ state }) => [Transition.emit('OpenTldSheet', { sheet: state.tldSheet })],
      }),
      ClickedMobileTldOption: Transition.opaque({
        name: 'domains.ClickedMobileTldOption',
        state: ModelSchema,
        input: Schema.Struct({ value: TldFilter }),
        reads: ({ state, input }) => [state.tldSheet, input.value],
        writes: ({ state }) => [state.tldFilter, state.tldSheet],
        run: (model, { value }) => {
          const next = Sheet.close(model.tldSheet).model
          return modifyFields(model, {
            tldFilter: () => value,
            tldSheet: () => next,
          })
        },
        emits: ({ state }) => [Transition.emit('CloseTldSheet', { sheet: state.tldSheet })],
      }),
      ClickedCart: Transition.opaque({
        name: 'domains.ClickedCart',
        state: ModelSchema,
        input: emptyInput,
        reads: ({ state }) => [state.cartSheet],
        writes: ({ state }) => [state.cartSheet],
        run: model => {
          const next = Sheet.open(model.cartSheet).model
          return next === model.cartSheet ? model : modifyFields(model, { cartSheet: () => next })
        },
        emits: ({ state }) => [Transition.emit('OpenCartSheet', { sheet: state.cartSheet })],
      }),

      // 4 widget Messages (backed by Sheet.machine & WindowList.machine)
      GotFiltersSheetMessage: Transition.opaque({
        name: 'domains.GotFiltersSheetMessage',
        state: ModelSchema,
        input: Schema.Struct({ message: Sheet.Message }),
        reads: ({ state, input }) => [state.filtersSheet, input.message],
        writes: ({ state }) => [state.filtersSheet],
        run: (model, { message }) => {
          const next = Sheet.update(model.filtersSheet, message).model
          return next === model.filtersSheet
            ? model
            : modifyFields(model, { filtersSheet: () => next })
        },
        emits: ({ state, input }) => [
          Transition.emit('FiltersSheetStep', {
            sheet: state.filtersSheet,
            message: input.message,
          }),
        ],
      }),
      GotTldSheetMessage: Transition.opaque({
        name: 'domains.GotTldSheetMessage',
        state: ModelSchema,
        input: Schema.Struct({ message: Sheet.Message }),
        reads: ({ state, input }) => [state.tldSheet, input.message],
        writes: ({ state }) => [state.tldSheet],
        run: (model, { message }) => {
          const next = Sheet.update(model.tldSheet, message).model
          return next === model.tldSheet ? model : modifyFields(model, { tldSheet: () => next })
        },
        emits: ({ state, input }) => [
          Transition.emit('TldSheetStep', { sheet: state.tldSheet, message: input.message }),
        ],
      }),
      GotCartSheetMessage: Transition.opaque({
        name: 'domains.GotCartSheetMessage',
        state: ModelSchema,
        input: Schema.Struct({ message: Sheet.Message }),
        reads: ({ state, input }) => [state.cartSheet, input.message],
        writes: ({ state }) => [state.cartSheet],
        run: (model, { message }) => {
          const next = Sheet.update(model.cartSheet, message).model
          return next === model.cartSheet ? model : modifyFields(model, { cartSheet: () => next })
        },
        emits: ({ state, input }) => [
          Transition.emit('CartSheetStep', { sheet: state.cartSheet, message: input.message }),
        ],
      }),
      GotResultsListMessage: Transition.opaque({
        name: 'domains.GotResultsListMessage',
        state: ModelSchema,
        input: Schema.Struct({ message: WindowList.Message }),
        reads: ({ state, input }) => [state.resultsList, state.from, input.message],
        writes: ({ state }) => [state.resultsList, state.from],
        run: (model, { message }) => {
          const next = WindowList.update(model.resultsList, message).model
          return next === model.resultsList && model.from === 0
            ? model
            : modifyFields(model, { resultsList: () => next, from: () => 0 })
        },
      }),
      // 1 store-read + cart-insert Message (Phase 3 Bout 3.6)
      ClickedAddDomain: Transition.opaque({
        name: 'domains.ClickedAddDomain',
        state: ModelSchema,
        input: Schema.Struct({ name: Cart.Name }),
        reads: ({ state, input }) => [state.remote, state.cart, input.name],
        writes: ({ state }) => [state.cart],
        run: (model, { name }) => {
          if (readAvailableQuote === undefined) return model
          return Option.match(readAvailableQuote(model, name), {
            onNone: () => model,
            onSome: domain =>
              Array.some(model.cart, held => held.name === domain.name)
                ? model
                : modifyFields(model, { cart: cart => Array.append(cart, domain) }),
          })
        },
      }),
    },
  })
}

export type DomainsMachine = ReturnType<typeof makeDomainsMachine>
