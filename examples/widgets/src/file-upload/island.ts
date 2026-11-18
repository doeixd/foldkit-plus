import { Runtime } from 'foldkit'
import { FileUpload } from 'foldkit-mixins-ui'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { FieldStyle, FileUploadForm, FormStyle, SubmitStyle } from './view.js'

const trace = (): ReadonlyArray<string> => {
  const file = (name: string, size = 10) =>
    new File(['x'.repeat(size)], name, {
      lastModified: 1,
      type: name.endsWith('.png') ? 'image/png' : 'text/plain',
    })
  const resume = file('resume.pdf')
  const lines: Array<string> = []
  let model = initial()
  const send = (label: string, message: FileUpload.Message) => {
    const result = update(model, Message.GotUploadMessage({ message }))
    model = result.model
    const commands = (result.commands ?? []).map(command => command.name).join(', ')
    lines.push(
      `${label}: rows=[${model.upload.entries.map(each => each.name).join(', ')}] refused=[${model.upload.refusals.map(each => each._tag).join(', ')}] commands=[${commands}]`,
    )
  }
  send(
    'dropped resume.pdf and photo.png',
    FileUpload.Message.Offered({ files: [resume, file('photo.png')], by: 'drop' }),
  )
  send('dropped notes.txt', FileUpload.Message.Offered({ files: [file('notes.txt')], by: 'drop' }))
  send(
    'dropped a 3 MB scan',
    FileUpload.Message.Offered({ files: [file('scan.pdf', 3_000_000)], by: 'drop' }),
  )
  send('removed resume.pdf', FileUpload.Message.Removed({ id: 'local-1' }))
  return lines
}

export const island: IslandBody = {
  runDemo: trace,
  style: () => merged(FormStyle, FieldStyle, SubmitStyle),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial() }),
        update,
        view: FileUploadForm,
        container,
      }),
    )
  },
}
