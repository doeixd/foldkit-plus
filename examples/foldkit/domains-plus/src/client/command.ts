/** What the page asks of the browser: navigation, focus, the keyboard. */
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { focus } from 'foldkit/dom'
import { load, pushUrl } from 'foldkit/navigation'
import { Message } from './message.js'

export const SEARCH_INPUT_ID = 'domain-search'
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
