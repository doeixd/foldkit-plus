import { Runtime } from 'foldkit'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { FieldStyle, FileForm, FormStyle, SubmitStyle } from './view.js'

const trace = (): ReadonlyArray<string> => {
  const file = (name: string) => new File([name], name, { lastModified: 1 })
  const resume = file('resume.pdf')
  const lines: Array<string> = []
  let model = initial
  const send = (label: string, message: Message) => {
    const result = update(model, message)
    model = result.model
    const commands = (result.commands ?? []).map(command => command.name).join(', ')
    lines.push(
      `${label}: rows=[${model.files.map(each => each.name).join(', ')}] commands=[${commands}]`,
    )
  }
  send('picked resume.pdf and photo.png', Message.Picked({ files: [resume, file('photo.png')] }))
  send('picked resume.pdf again', Message.Picked({ files: [file('resume.pdf')] }))
  send('removed resume.pdf', Message.Removed({ file: resume }))
  return lines
}

export const island: IslandBody = {
  runDemo: trace,
  style: () => merged(FormStyle, FieldStyle, SubmitStyle),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: FileForm,
        container,
      }),
    )
  },
}
