/**
 * Every Message the page handles: its own, Remote's, and the debounce's
 * under the variant `Bundle.declare` names for it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { debounce } from 'foldkit-primitives/time'
import { Remote } from 'foldkit-remote'

/**
 * The search text on its way to the reads. Each keystroke is `Changed`; the
 * text that rests 150 ms is the debounce's OutMessage, which moves the label
 * the reads read (`app.ts`). Upstream waits the same 150 ms inside its fetch.
 */
export const SearchInput = debounce({ name: 'SearchInput', value: Schema.String })
export const Search = Bundle.declare(SearchInput, 'search')

/** The page's own Messages, which its `update` answers; the placements answer the rest. */
const own = {
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  PressedEscape: {},
  ClickedClearSearch: {},
  ClickedRetrySearch: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedFocusSearchInput: {},
  CompletedDismissSearchKeyboard: {},
}
export const Own = defineMessageUnion(own)
export type Own = typeof Own.Type

export const Message = defineMessageUnion({ ...Remote.messages, ...Search.cases, ...own })
export type Message = typeof Message.Type
