import { Option } from 'effect'
import { InlineEdit } from 'foldkit-primitives/interaction'
import { Rename, initial, update, type Model } from './app.js'

const rename = (model: Model, message: InlineEdit.Message): Model =>
  update(model, Rename.wrapper.make(message)).model

const shown = (model: Model): string =>
  Option.match(model.rename.editing, {
    onNone: () => 'closed',
    onSome: editing =>
      `open on ${editing.id} with "${editing.draft}"${Option.match(editing.error, {
        onNone: () => '',
        onSome: reason => ` (${reason})`,
      })}`,
  })

/** A text trace of one rename accepted and one refused. */
export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial().model
  lines.push(`titles: ${model.titles.map(title => title.text).join(' | ')}`)

  model = rename(model, InlineEdit.Message.Started({ id: 'title-3', text: 'Ship it' }))
  model = rename(model, InlineEdit.Message.Changed({ id: 'title-3', text: 'write the guide' }))
  model = rename(model, InlineEdit.Message.Entered({ id: 'title-3' }))
  lines.push(`a duplicate: ${shown(model)}`)

  model = rename(model, InlineEdit.Message.Changed({ id: 'title-3', text: 'Ship it today' }))
  model = rename(model, InlineEdit.Message.Entered({ id: 'title-3' }))
  lines.push(`a new title: ${shown(model)}; titles: ${model.titles.map(t => t.text).join(' | ')}`)
  return lines
}
