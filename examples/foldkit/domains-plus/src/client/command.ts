/** What the page asks of the browser: navigation, focus, the keyboard. */
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { focus } from 'foldkit/dom'
import { load, pushUrl } from 'foldkit/navigation'
import { Message } from './message.js'
import { RESULTS_LIST_ID } from './resultsList.js'

export const SEARCH_INPUT_ID = 'domain-search'
/** The search form, which the filters' plain selects belong to on a page without scripts. */
export const SEARCH_FORM_ID = 'domain-search-form'
export const CART_BUTTON_ID = 'cart-button'
export const CART_CLOSE_BUTTON_ID = 'cart-close-button'
export const TLD_FILTER_BUTTON_ID = 'mobile-tld-filter'
export const FILTERS_BUTTON_ID = 'filters-button'
const TOUCH = '(hover: none) and (pointer: coarse)'

export const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

export const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

export const FocusSearchInput = Command.define('FocusSearchInput', {
  messages: [Message.CompletedFocusSearchInput],
  execute: focus(`#${SEARCH_INPUT_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusSearchInput()),
  ),
})

/** A submitted search on a touch screen puts the on-screen keyboard away. */
export const DismissSearchKeyboard = Command.define('DismissSearchKeyboard', {
  messages: [Message.CompletedDismissSearchKeyboard],
  execute: Effect.sync(() => {
    const input = document.getElementById(SEARCH_INPUT_ID)
    if (window.matchMedia(TOUCH).matches && input instanceof HTMLInputElement) input.blur()
    return Message.CompletedDismissSearchKeyboard()
  }),
})

/** Focus back on the Cart button, once the cart is closed. */
export const FocusCartButton = Command.define('FocusCartButton', {
  messages: [Message.CompletedFocusCartButton],
  execute: focus(`#${CART_BUTTON_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusCartButton()),
  ),
})

/** Focus back on the phone's TLD button, once its sheet is closed. */
export const FocusTldFilterButton = Command.define('FocusTldFilterButton', {
  messages: [Message.CompletedFocusTldFilterButton],
  execute: focus(`#${TLD_FILTER_BUTTON_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusTldFilterButton()),
  ),
})

/** Focus back on the phone's Filters and sort button, once its sheet is closed. */
export const FocusFiltersButton = Command.define('FocusFiltersButton', {
  messages: [Message.CompletedFocusFiltersButton],
  execute: focus(`#${FILTERS_BUTTON_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusFiltersButton()),
  ),
})

/** A domain removed from the open cart takes its button with it: focus goes to the close button. */
export const FocusCartCloseButton = Command.define('FocusCartCloseButton', {
  messages: [Message.CompletedFocusCartCloseButton],
  execute: focus(`#${CART_CLOSE_BUTTON_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusCartCloseButton()),
  ),
})

/**
 * The results list, focused from the keyboard, shows its start below the
 * header, as upstream's: the browser scrolls a focused element taller than
 * the window by its own measure, which put the first row out of view on a
 * phone. The list's `scroll-margin-top` keeps it clear of the header.
 */
export const RevealResultsListStart = Command.define('RevealResultsListStart', {
  messages: [Message.CompletedRevealResultsListStart],
  execute: Effect.sync(() => {
    const results = document.getElementById(RESULTS_LIST_ID)
    if (document.activeElement === results && results?.matches(':focus-visible') === true)
      results.scrollIntoView({ block: 'start', behavior: 'instant' })
    return Message.CompletedRevealResultsListStart()
  }),
})

/** An emptied search shows the landing's empty page from its top, as upstream's does. */
export const ScrollPageToTop = Command.define('ScrollPageToTop', {
  messages: [Message.CompletedScrollPageToTop],
  execute: Effect.sync(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    return Message.CompletedScrollPageToTop()
  }),
})
