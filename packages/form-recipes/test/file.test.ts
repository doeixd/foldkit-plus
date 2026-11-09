/**
 * The file recipe's control through a real form: what each Message makes of
 * the key's draft and value. The upload itself is `upload.browser.test.ts`'s
 * (in foldkit-media), and the drawn control `file.browser.test.ts`'s.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { FileAsset } from 'foldkit-media'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import {
  file as fileRecipe,
  FileMessage,
  FileUpload,
  fileWords,
  sizeText,
  type FileModel,
} from '../src/file.js'

const asset = Schema.decodeUnknownSync(FileAsset)({
  key: 'b'.repeat(32),
  name: 'report.pdf',
  type: 'application/pdf',
  size: 1_234_567,
})
const Doc = Entity.define('Doc', Schema.Struct({ id: Schema.String, attachment: FileAsset }))
const build = (options: Partial<Parameters<typeof fileRecipe>[0]> = {}) => {
  const Attachment = fileRecipe({ id: 'attachment', ...options })
  const DocForm = Form.make(
    'DocForm',
    Entity.input(Doc, Schema.Struct({ attachment: Doc.fields.attachment.schema })),
    { inputs: { attachment: Attachment.control } },
  )
  return { Attachment, DocForm, attachment: DocForm.control('attachment') }
}
const { Attachment, DocForm, attachment } = build()
type Model = typeof DocForm.initial

const step = (model: Model, message: FileMessage) =>
  DocForm.bundle.update(model, attachment.send(message), undefined)
const update = (model: Model, ...messages: ReadonlyArray<FileMessage>): Model =>
  messages.reduce((current, message) => step(current, message).model, model)
const draft = (model: Model): FileModel => attachment.field(model).value
/** The File a send or a refusal holds, compared by identity (`toEqual` cannot tell two Files apart). */
const held = (model: Model): File | undefined =>
  FileUpload.matchOrElse(
    draft(model).upload,
    { Sending: ({ file }) => file, Refused: ({ file }) => file },
    () => undefined,
  )
const file = (name = 'report.pdf', bytes = 8) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
const dropped = (...files: [File, ...Array<File>]) =>
  FileMessage.GotDrop({ message: { _tag: 'DroppedFiles', files } })

describe('the file recipe', () => {
  it('sends the first file dropped, as the first attempt, from nothing sent', () => {
    const chosen = file()
    const model = update(DocForm.initial, dropped(chosen, file('second.pdf')))
    expect(held(model)).toBe(chosen)
    expect(draft(model).upload).toMatchObject({
      _tag: 'Sending',
      attempt: 1,
      loaded: 0,
      total: chosen.size,
    })
    expect(DocForm.partial(model)).toEqual({})
  })

  it('follows its own send’s progress and ignores an earlier one’s', () => {
    const sending = update(DocForm.initial, dropped(file()))
    const moved = update(sending, FileMessage.Progressed({ attempt: 1, loaded: 4, total: 40 }))
    expect(draft(moved).upload).toMatchObject({ loaded: 4, total: 40 })
    expect(update(moved, FileMessage.Progressed({ attempt: 0, loaded: 8, total: 8 }))).toBe(moved)
  })

  it('takes the facts the route kept as the key’s value', () => {
    const kept = update(
      DocForm.initial,
      dropped(file()),
      FileMessage.Uploaded({ attempt: 1, asset }),
    )
    expect(draft(kept).upload).toEqual({ _tag: 'Kept', asset })
    expect(DocForm.partial(kept)).toEqual({ attachment: asset })
  })

  it('keeps a refusal without a value, and sends the same file again on retry', () => {
    const chosen = file()
    const refused = update(
      DocForm.initial,
      dropped(chosen),
      FileMessage.Failed({ attempt: 1, reason: 'RateLimited', status: 429 }),
    )
    expect(held(refused)).toBe(chosen)
    expect(draft(refused).upload).toMatchObject({
      _tag: 'Refused',
      reason: 'RateLimited',
      status: 429,
    })
    expect(DocForm.partial(refused)).toEqual({})
    expect(update(refused, FileMessage.Uploaded({ attempt: 1, asset }))).toBe(refused)
    const retried = update(refused, FileMessage.Retried())
    expect(draft(retried).upload).toMatchObject({ _tag: 'Sending', attempt: 2 })
    expect(held(retried)).toBe(chosen)
    expect(update(retried, FileMessage.Uploaded({ attempt: 1, asset }))).toBe(retried)
  })

  it('cancels a send to nothing, and its answer arriving after is ignored', () => {
    const cancelled = update(DocForm.initial, dropped(file()), FileMessage.Cancelled())
    expect(draft(cancelled).upload).toEqual({ _tag: 'Empty' })
    expect(update(cancelled, FileMessage.Uploaded({ attempt: 1, asset }))).toBe(cancelled)
    expect(draft(update(cancelled, dropped(file()))).upload).toMatchObject({ attempt: 2 })
  })

  it.each([
    ['Cancelled when nothing is sending', () => FileMessage.Cancelled()],
    ['Retried when nothing was refused', () => FileMessage.Retried()],
    ['Removed when there is nothing', () => FileMessage.Removed()],
  ] as const)('changes nothing on %s', (_, message) => {
    expect(update(DocForm.initial, message())).toBe(DocForm.initial)
  })

  it.each([
    ['sending', [dropped(file())]],
    [
      'refused',
      [dropped(file()), FileMessage.Failed({ attempt: 1, reason: 'Network', status: 0 })],
    ],
    ['kept', [dropped(file()), FileMessage.Uploaded({ attempt: 1, asset })]],
  ] as const)('removes a file %s, leaving the key empty', (_, messages) => {
    const removed = update(DocForm.initial, ...messages, FileMessage.Removed())
    expect(draft(removed).upload).toEqual({ _tag: 'Empty' })
    expect(DocForm.partial(removed)).toEqual({})
  })

  it('fills a stored file as kept, and shows it again settled', () => {
    const filled = DocForm.fill(DocForm.initial, { attachment: asset }).model
    expect(draft(filled).upload).toEqual({ _tag: 'Kept', asset })
    expect(draft(DocForm.settled(filled)).upload).toEqual({ _tag: 'Kept', asset })
  })

  it.each([
    ['on its way', [dropped(file())]],
    [
      'refused',
      [dropped(file()), FileMessage.Failed({ attempt: 1, reason: 'Network', status: 0 })],
    ],
  ] as const)('settles a file %s to nothing, since a stored draft holds no File', (_, messages) => {
    const model = update(DocForm.initial, ...messages)
    expect(draft(DocForm.settled(model)).upload).toEqual({ _tag: 'Empty' })
  })

  it('settles a drag left over in a stored draft', () => {
    const dragging = update(
      DocForm.initial,
      FileMessage.GotDrop({ message: { _tag: 'EnteredDragZone' } }),
    )
    expect(draft(dragging).drop.isDragOver).toBe(true)
    expect(draft(DocForm.settled(dragging)).drop.isDragOver).toBe(false)
  })

  it('moves focus on when a press takes its button away', () => {
    const sending = update(DocForm.initial, dropped(file()))
    const selectors = (message: FileMessage, from: Model) =>
      step(from, message).commands?.map(command => command.args)
    expect(selectors(FileMessage.Cancelled(), sending)).toEqual([{ selector: '#attachment' }])
    const refused = update(
      sending,
      FileMessage.Failed({ attempt: 1, reason: 'TooLarge', status: 413 }),
    )
    expect(selectors(FileMessage.Retried(), refused)).toEqual([{ selector: '#attachment-cancel' }])
    expect(selectors(FileMessage.Removed(), refused)).toEqual([{ selector: '#attachment' }])
  })

  it('reads a file in a list by its name and size', () => {
    expect(Attachment.display.text(asset, {})).toBe('report.pdf (1.2 MB)')
  })
})

describe('a file larger than maxBytes', () => {
  const small = build({ maxBytes: 10 })
  const smallStep = (model: typeof small.DocForm.initial, message: FileMessage) =>
    small.DocForm.bundle.update(model, small.attachment.send(message), undefined)
  const buttons = (model: typeof small.DocForm.initial) =>
    Inert.byTag(
      Inert.draw(FormView.define(small.DocForm), { model, errors: [], canSubmit: false }),
      'button',
    )
      .filter(button =>
        ['attachment-retry', 'attachment-remove'].includes(String(Inert.value(button, 'id'))),
      )
      .map(Inert.text)

  it('is refused before sending, with no retry offered or sent', () => {
    const big = file('big.pdf', 11)
    const refused = smallStep(small.DocForm.initial, dropped(big)).model
    expect(small.attachment.field(refused).value.upload).toMatchObject({
      _tag: 'Refused',
      reason: 'TooLarge',
      status: 0,
    })
    expect(smallStep(refused, FileMessage.Retried()).model).toBe(refused)
    expect(buttons(refused)).toEqual(['Remove'])
  })

  it('takes a file of exactly maxBytes', () => {
    const sent = smallStep(small.DocForm.initial, dropped(file('ok.pdf', 10))).model
    expect(small.attachment.field(sent).value.upload).toMatchObject({ _tag: 'Sending' })
  })

  it('offers a retry for the route’s refusal', () => {
    const model = smallStep(
      smallStep(small.DocForm.initial, dropped(file('ok.pdf', 10))).model,
      FileMessage.Failed({ attempt: 1, reason: 'Busy', status: 503 }),
    ).model
    expect(buttons(model)).toEqual(['Try again', 'Remove'])
  })

  it('defaults to 20 MB', () => {
    const over = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.bin')
    expect(draft(update(DocForm.initial, dropped(over))).upload).toMatchObject({ _tag: 'Refused' })
    const exact = new File([new Uint8Array(20 * 1024 * 1024)], 'edge.bin')
    expect(draft(update(DocForm.initial, dropped(exact))).upload).toMatchObject({ _tag: 'Sending' })
  })
})

describe('the file control drawn', () => {
  const draw = (model: Model, options?: Parameters<typeof build>[0]) => {
    const made = options === undefined ? { DocForm } : build(options)
    return Inert.draw(FormView.define(made.DocForm), {
      model: model as never,
      errors: [],
      canSubmit: false,
    })
  }
  const kept = update(DocForm.initial, dropped(file()), FileMessage.Uploaded({ attempt: 1, asset }))

  it('links a kept file’s name and size to its download under the default url', () => {
    const link = Inert.byTag(draw(kept), 'a')[0]
    expect(Inert.value(link, 'href')).toBe(`/_media/files/${asset.key}`)
    expect(Inert.text(link)).toBe('report.pdf (1.2 MB)')
  })

  it('links under the url it was given', () => {
    const custom = build({ url: '/docs' })
    const model = custom.DocForm.fill(custom.DocForm.initial, { attachment: asset }).model
    const link = Inert.byTag(draw(model as never, { url: '/docs' }), 'a')[0]
    expect(Inert.value(link, 'href')).toBe(`/docs/${asset.key}`)
  })

  it('offers every file to the picker unless told otherwise, and only what accept lists when told', () => {
    const inputs = (root: ReturnType<typeof draw>) =>
      Inert.byTag(root, 'input').map(input => Inert.value(input, 'accept'))
    expect(inputs(draw(DocForm.initial))).toEqual([undefined])
    expect(inputs(draw(DocForm.initial, { accept: ['application/pdf', 'image/*'] }))).toEqual([
      'application/pdf,image/*',
    ])
  })
})

describe('the file words', () => {
  it.each(Object.entries(fileWords.refused))('says %s in words of its own', (reason, words) => {
    expect(words.length).toBeGreaterThan(0)
    expect(
      Object.entries(fileWords.refused).filter(
        ([other, said]) => said === words && other !== reason,
      ),
    ).toEqual([])
  })

  it.each(Object.entries(fileWords.refused))(
    'says a %s refusal by that reason',
    (reason, words) => {
      const model = update(
        DocForm.initial,
        dropped(file('a.pdf')),
        FileMessage.Failed({ attempt: 1, reason: reason as never, status: 0 }),
      )
      const root = Inert.draw(FormView.define(DocForm), { model, errors: [], canSubmit: false })
      const said = Inert.all(root).find(node => Inert.value(node, 'role') === 'status')
      expect(Inert.text(said!)).toBe(words.replace('{name}', 'a.pdf'))
    },
  )
})

describe('sizeText', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1000, '1.0 kB'],
    [1536, '1.5 kB'],
    [1_234_567, '1.2 MB'],
    [5_000_000_000, '5.0 GB'],
  ])('writes %i as %s', (bytes, text) => expect(sizeText(bytes)).toBe(text))
})

describe('a file recipe made wrong', () => {
  it.each([
    ['a header name with a space', { headers: { 'x token': 'a' } }],
    ['an address that is none', { url: 'http://[' }],
    ['a header the browser sets itself', { headers: { Cookie: 'a=b' } }],
    ['a size that is no whole number', { maxBytes: 1.5 }],
    ['a negative size', { maxBytes: -1 }],
  ])('throws when it is made, for %s', (_, options) =>
    expect(() => fileRecipe({ id: 'attachment', ...options })).toThrow(/^file: /),
  )
  it.each(['1doc', 'doc.main'])('throws for an id %s no selector names', id =>
    expect(() => fileRecipe({ id })).toThrow(/^file: /),
  )
})

describe('a submit made while a file is on its way', () => {
  const submit = (model: Model) =>
    DocForm.bundle.update(model, DocForm.Message.Submitted(), undefined)

  it('waits for the route, and goes with what it kept', () => {
    const waiting = submit(update(DocForm.initial, dropped(file())))
    expect([waiting.outMessage, waiting.model.submitPending]).toEqual([undefined, true])
    expect(attachment.field(waiting.model)._tag).toBe('Validating')
    const landed = step(waiting.model, FileMessage.Uploaded({ attempt: 1, asset }))
    expect(landed.outMessage).toEqual({ _tag: 'Submitted', value: { attachment: asset } })
  })

  it('goes nowhere when the send is cancelled', () => {
    const waiting = submit(update(DocForm.initial, dropped(file()))).model
    const cancelled = step(waiting, FileMessage.Cancelled())
    expect([cancelled.outMessage, cancelled.model.submitPending]).toEqual([undefined, false])
  })

  it('is drawn busy while it waits', () => {
    const waiting = submit(update(DocForm.initial, dropped(file()))).model
    const root = Inert.draw(FormView.define(DocForm), {
      model: waiting,
      errors: [],
      canSubmit: false,
    })
    const group = Inert.all(root).find(node => Inert.value(node, 'id') === 'DocForm-attachment')
    expect(Inert.value(group, 'aria-busy')).toBe('true')
  })
})
