/**
 * The primitives the Primitives gallery runs in the page: each placed in the
 * gallery's own Model, as an application places them, so what an example draws
 * is what the placement holds. `Dark` and `Ticks` are the guides'.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { WindowSize } from 'foldkit-primitives/events'
import { Tween } from 'foldkit-primitives/motion'
import { Online } from 'foldkit-primitives/net'
import { history } from 'foldkit-primitives/state'

export const Connection = Bundle.declare(Online, 'online')
export const Window = Bundle.declare(WindowSize, 'windowSize')
export const Fade = Bundle.declare(Tween, 'fade')

/** The undo stack of the text the history example edits. */
export const NoteHistory = history({ name: 'NoteHistory', value: Schema.String })
export const Note = Bundle.declare(NoteHistory, 'note')

export const fields = {
  ...Connection.fields,
  ...Window.fields,
  ...Fade.fields,
  ...Note.fields,
}

export const cases = {
  ...Connection.cases,
  ...Window.cases,
  ...Fade.cases,
  ...Note.cases,
}
