/**
 * Every Message the page handles: its own, Remote's, and the debounce's
 * under the variant `Bundle.declare` names for it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import * as UiListbox from '@foldkit/ui/listbox'
import { Sheet, WindowList } from 'foldkit-mixins-ui'
import { debounce } from 'foldkit-primitives/time'
import { Remote } from 'foldkit-remote'
import { AvailabilityFilter, Cart, SortOrder, TldFilter } from './domain'
import { ResultsListScrollKey } from './resultsList'

/**
 * The search text on its way to the reads. Each keystroke is `Changed`; the
 * text that rests 150 ms is the debounce's OutMessage, which moves the label
 * the reads read (`app.ts`). Upstream waits the same 150 ms inside its fetch.
 */
export const SearchInput = debounce({ name: 'SearchInput', value: Schema.String })
export const Search = Bundle.declare(SearchInput, 'search')

/** The sheet a press waited on the sheets' chunk for, opened once it is in. */
export const SheetToOpen = Schema.Literals(['Cart', 'Tld', 'Filters'])
export type SheetToOpen = typeof SheetToOpen.Type

/** The page's own Messages, which its `update` answers; the placements answer the rest. */
const own = {
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  PressedEscape: {},
  ClickedClearSearch: {},
  ClickedRetrySearch: {},
  ClickedDomainsHome: {},
  ClickedSkipToMain: {},
  GotResultsListMessage: { message: WindowList.Message },
  FocusedResultsList: {},
  CompletedRevealResultsListStart: {},
  PressedResultsListScrollKey: { key: ResultsListScrollKey },
  CompletedScrollPage: {},
  GotTldListboxMessage: { message: UiListbox.Message },
  GotAvailabilityListboxMessage: { message: UiListbox.Message },
  GotSortListboxMessage: { message: UiListbox.Message },
  GotTldSheetMessage: { message: Sheet.Message },
  ClickedTldFilter: {},
  UpdatedTldSearch: { value: Schema.String },
  ClickedMobileTldOption: { value: TldFilter },
  GotFiltersSheetMessage: { message: Sheet.Message },
  ClickedFilters: {},
  ClickedMobileAvailabilityOption: { value: AvailabilityFilter },
  ClickedMobileSortOption: { value: SortOrder },
  // A name, not the priced domain: `update` takes the price from what was
  // read, so a form posted without scripts cannot name its own price.
  ClickedAddDomain: { name: Cart.Name },
  ClickedRemoveDomain: { name: Cart.Name },
  ClickedRemoveCartDomain: { name: Cart.Name },
  ClickedCart: {},
  // Hover, focus or a press on what opens a sheet: its chunk starts loading.
  WantedSheets: {},
  LoadedSheets: { opens: Schema.Option(SheetToOpen) },
  FailedToLoadSheets: {},
  GotCartSheetMessage: { message: Sheet.Message },
  CompletedFocusCartButton: {},
  CompletedFocusCartCloseButton: {},
  CompletedFocusFiltersButton: {},
  CompletedFocusTldFilterButton: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedFocusSearchInput: {},
  CompletedDismissSearchKeyboard: {},
  CompletedScrollPageToTop: {},
}
export const Own = defineMessageUnion(own)
export type Own = typeof Own.Type

export const Message = defineMessageUnion({ ...Remote.messages, ...Search.cases, ...own })
export type Message = typeof Message.Type
