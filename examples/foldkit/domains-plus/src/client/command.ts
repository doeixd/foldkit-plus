/** What the page asks of the browser: navigation, focus, the keyboard. */
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { focus } from 'foldkit/dom'
import { load, pushUrl } from 'foldkit/navigation'
import { Message } from './message.js'

export const SEARCH_INPUT_ID = 'domain-search'
export const CART_BUTTON_ID = 'cart-button'
export const CART_CLOSE_BUTTON_ID = 'cart-close-button'
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

/** A domain removed from the open cart takes its button with it: focus goes to the close button. */
export const FocusCartCloseButton = Command.define('FocusCartCloseButton', {
  messages: [Message.CompletedFocusCartCloseButton],
  execute: focus(`#${CART_CLOSE_BUTTON_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusCartCloseButton()),
  ),
})
