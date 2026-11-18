import { FocusRecovery } from 'foldkit-primitives/interaction'
import { ToastSlots } from './slots.js'

/**
 * Dismissing the toast that holds focus (its close button, its action) hands
 * focus to the same button of the toast behind it, else of the one in front (an action
 * with none to go to, to a close button). It is a mixin beside
 * the style, not on by default: it sends no Message, which a Scene test of a
 * page drawing the stack could not resolve. With no toast left, focus is not
 * moved: recovery never guesses a place outside the stack.
 */
export const keepFocus = [
  FocusRecovery.behavior(ToastSlots)<unknown, never>({
    owner: 'container',
    parts: {
      close: ['next', 'previous'],
      action: ['next', 'previous', { part: 'close' }],
      cancel: ['next', 'previous', { part: 'close' }],
    },
  }).mixin,
]
