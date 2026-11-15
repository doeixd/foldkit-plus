/** A text trace of the hotkeys section's `update`: what each shortcut does, and what the buttons say. */
import { Option } from 'effect'
import { ariaKeyshortcuts, formatHotkey } from 'foldkit-primitives/events'
import {
  Message,
  UNDO,
  WITHIN_MS,
  initialOf,
  redoLabel,
  titleOf,
  undoLabel,
  update,
  type Model,
} from './app.js'

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  const show = (what: string, model: Model) =>
    lines.push(`${what}: title=${titleOf(model)} [${undoLabel(model)}] [${redoLabel(model)}]`)

  for (const platform of ['windows', 'mac'] as const) {
    lines.push(
      `${platform}: ${UNDO} is ${Option.getOrElse(formatHotkey(UNDO, platform), () => '')} for a person and ${Option.getOrElse(ariaKeyshortcuts(UNDO, platform), () => '')} for aria-keyshortcuts`,
    )
  }

  let model = initialOf('windows').model
  show('start', model)
  model = update(model, Message.Typed({ text: 'Draft', at: 0 })).model
  model = update(model, Message.Typed({ text: 'Draft one', at: WITHIN_MS - 1 })).model
  show('typed with no pause', model)
  model = update(model, Message.Typed({ text: 'Draft one!', at: 3 * WITHIN_MS })).model
  show('typed after a pause', model)
  model = update(model, Message.Renamed()).model
  show('renamed', model)
  model = update(model, Message.Undone()).model
  show('undone', model)
  return lines
}
