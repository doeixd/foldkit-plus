/**
 * The image recipe's control through a real form: what each Message makes of
 * the key's draft and value. The upload itself is `upload.browser.test.ts`'s,
 * and the drawn control `image.browser.test.ts`'s.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { HashedAsset } from 'foldkit-media'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { image, ImageMessage, ImageUpload, type ImageModel } from '../src/image.js'

const hash = 'b'.repeat(64)
const asset = Schema.decodeUnknownSync(HashedAsset)({
  key: hash,
  width: 640,
  height: 480,
  alpha: false,
  hash,
  placeholder: null,
})
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, cover: HashedAsset }))
const Cover = image({ id: 'cover' })
const PostForm = Form.make(
  'PostForm',
  Entity.input(Post, Schema.Struct({ cover: Post.fields.cover.schema })),
  { inputs: { cover: Cover.control } },
)
const cover = PostForm.control('cover')
type Model = typeof PostForm.initial

const update = (model: Model, ...messages: ReadonlyArray<ImageMessage>): Model =>
  messages.reduce(
    (current, message) => PostForm.bundle.update(current, cover.send(message), undefined).model,
    model,
  )
const draft = (model: Model): ImageModel => cover.field(model).value
/**
 * The File a send or a refusal holds. Compared by identity: `toEqual` reads a
 * File's own properties, and its `name` is not one, so two files of equal bytes
 * would pass for each other.
 */
const held = (model: Model): File | undefined =>
  ImageUpload.matchOrElse(
    draft(model).upload,
    { Sending: ({ file }) => file, Refused: ({ file }) => file },
    () => undefined,
  )
const file = (name = 'cover.png') => new File([new Uint8Array(8)], name, { type: 'image/png' })
const dropped = (...files: [File, ...Array<File>]) =>
  ImageMessage.GotDrop({ message: { _tag: 'DroppedFiles', files } })

describe('the image recipe', () => {
  it('sends the first file dropped, as the first attempt, from nothing sent', () => {
    const chosen = file()
    const model = update(PostForm.initial, dropped(chosen, file('second.png')))
    expect(held(model)).toBe(chosen)
    expect(draft(model).upload).toMatchObject({
      _tag: 'Sending',
      attempt: 1,
      loaded: 0,
      total: chosen.size,
    })
    // On its way is not a value.
    expect(PostForm.partial(model)).toEqual({})
  })

  it('follows its own send’s progress and ignores an earlier one’s', () => {
    const sending = update(PostForm.initial, dropped(file()))
    const moved = update(sending, ImageMessage.Progressed({ attempt: 1, loaded: 4, total: 8 }))
    expect(draft(moved).upload).toMatchObject({ loaded: 4, total: 8 })
    const stale = update(moved, ImageMessage.Progressed({ attempt: 0, loaded: 8, total: 8 }))
    expect(stale).toBe(moved)
  })

  it('takes the facts the route kept as the key’s value', () => {
    const kept = update(
      PostForm.initial,
      dropped(file()),
      ImageMessage.Uploaded({ attempt: 1, asset }),
    )
    expect(draft(kept).upload).toEqual({ _tag: 'Kept', asset })
    expect(cover.field(kept)).toMatchObject({ _tag: 'Valid' })
    expect(PostForm.partial(kept)).toEqual({ cover: asset })
  })

  it('keeps a refusal without a value, and sends the same file again on retry', () => {
    const chosen = file()
    const refused = update(
      PostForm.initial,
      dropped(chosen),
      ImageMessage.Failed({ attempt: 1, reason: 'TooLarge', status: 413 }),
    )
    expect(held(refused)).toBe(chosen)
    expect(draft(refused).upload).toMatchObject({
      _tag: 'Refused',
      reason: 'TooLarge',
      status: 413,
    })
    expect(PostForm.partial(refused)).toEqual({})
    // A late answer of the refused send changes nothing.
    expect(update(refused, ImageMessage.Uploaded({ attempt: 1, asset }))).toBe(refused)
    const retried = update(refused, ImageMessage.Retried())
    expect(draft(retried).upload).toMatchObject({ _tag: 'Sending', attempt: 2 })
    expect(held(retried)).toBe(chosen)
    expect(update(retried, ImageMessage.Uploaded({ attempt: 1, asset }))).toBe(retried)
  })

  it('cancels a send to nothing, and its answer arriving after is ignored', () => {
    const cancelled = update(PostForm.initial, dropped(file()), ImageMessage.Cancelled())
    expect(draft(cancelled).upload).toEqual({ _tag: 'Empty' })
    expect(update(cancelled, ImageMessage.Uploaded({ attempt: 1, asset }))).toBe(cancelled)
    // A new drop is a new attempt, so the cancelled send's events stay ignored.
    expect(draft(update(cancelled, dropped(file()))).upload).toMatchObject({ attempt: 2 })
  })

  it.each([
    ['Cancelled when nothing is sending', () => ImageMessage.Cancelled()],
    ['Retried when nothing was refused', () => ImageMessage.Retried()],
    ['Removed when there is nothing', () => ImageMessage.Removed()],
  ] as const)('changes nothing on %s', (_, message) => {
    expect(update(PostForm.initial, message())).toBe(PostForm.initial)
  })

  it('removes a kept image, leaving the key empty', () => {
    const removed = update(
      PostForm.initial,
      dropped(file()),
      ImageMessage.Uploaded({ attempt: 1, asset }),
      ImageMessage.Removed(),
    )
    expect(draft(removed).upload).toEqual({ _tag: 'Empty' })
    expect(PostForm.partial(removed)).toEqual({})
  })

  it('fills a stored image as kept, and shows it again settled', () => {
    const filled = PostForm.fill(PostForm.initial, { cover: asset }).model
    expect(draft(filled).upload).toEqual({ _tag: 'Kept', asset })
    expect(draft(PostForm.settled(filled)).upload).toEqual({ _tag: 'Kept', asset })
  })

  it.each([
    ['on its way', [dropped(file())]],
    [
      'refused',
      [dropped(file()), ImageMessage.Failed({ attempt: 1, reason: 'Network', status: 0 })],
    ],
  ] as const)('settles a file %s to nothing, since a stored draft holds no File', (_, messages) => {
    const model = update(PostForm.initial, ...messages)
    expect(draft(PostForm.settled(model)).upload).toEqual({ _tag: 'Empty' })
  })

  it('reads an image in a list by its size', () => {
    expect(Cover.display.text(asset, {})).toBe('640 × 480')
  })
})

describe('the image recipe, after the review', () => {
  const step = (model: Model, message: ImageMessage) =>
    PostForm.bundle.update(model, cover.send(message), undefined)

  it.each([
    ['sending', [dropped(file())]],
    [
      'refused',
      [dropped(file()), ImageMessage.Failed({ attempt: 1, reason: 'Network', status: 0 })],
    ],
  ] as const)('removes a file %s, leaving the key empty', (_, messages) => {
    const removed = update(PostForm.initial, ...messages, ImageMessage.Removed())
    expect(draft(removed).upload).toEqual({ _tag: 'Empty' })
  })

  it('follows the total a send reports, not the file’s size', () => {
    const sending = update(PostForm.initial, dropped(file()))
    const moved = update(sending, ImageMessage.Progressed({ attempt: 1, loaded: 3, total: 40 }))
    expect(draft(moved).upload).toMatchObject({ loaded: 3, total: 40 })
  })

  it('refuses a dropped file that is no image before sending it', () => {
    const pdf = new File([new Uint8Array(8)], 'notes.pdf', { type: 'application/pdf' })
    const refused = update(PostForm.initial, dropped(pdf))
    expect(draft(refused).upload).toMatchObject({
      _tag: 'Refused',
      reason: 'Unsupported',
      status: 0,
    })
    expect(held(refused)).toBe(pdf)
  })

  it('moves focus on when a press takes its button away', () => {
    const sending = update(PostForm.initial, dropped(file()))
    expect(step(sending, ImageMessage.Cancelled()).commands?.map(command => command.args)).toEqual([
      { selector: '#cover' },
    ])
    const refused = update(
      sending,
      ImageMessage.Failed({ attempt: 1, reason: 'TooLarge', status: 413 }),
    )
    expect(step(refused, ImageMessage.Retried()).commands?.map(command => command.args)).toEqual([
      { selector: '#cover-cancel' },
    ])
    expect(step(refused, ImageMessage.Removed()).commands?.map(command => command.args)).toEqual([
      { selector: '#cover' },
    ])
  })

  it('settles a drag left over in a stored draft', () => {
    const dragging = update(
      PostForm.initial,
      ImageMessage.GotDrop({ message: { _tag: 'EnteredDragZone' } }),
    )
    expect(draft(dragging).drop.isDragOver).toBe(true)
    expect(draft(PostForm.settled(dragging)).drop.isDragOver).toBe(false)
  })
})

describe('an image recipe made wrong', () => {
  it.each([
    ['a header name with a space', { headers: { 'x token': 'a' } }],
    ['a header value with a line break', { headers: { 'x-token': 'a\r\nb' } }],
    ['an address that is none', { url: 'http://[' }],
    ['a header value past what a request holds', { headers: { 'x-name': '€' } }],
    ['a header the browser sets itself', { headers: { Cookie: 'a=b' } }],
  ])('throws when it is made, for %s', (_, options) =>
    expect(() => image({ id: 'cover', ...options })).toThrow(/^image: /),
  )
  // The id is also the selector focus goes to: `#1cover` throws, `#cover.main` names a class.
  it.each(['1cover', 'cover.main', 'cover:main'])('throws for an id %s no selector names', id =>
    expect(() => image({ id })).toThrow(/^image: /),
  )
})

describe('a submit made while a file is on its way', () => {
  const submit = (model: Model) =>
    PostForm.bundle.update(model, PostForm.Message.Submitted(), undefined)
  const step = (model: Model, message: ImageMessage) =>
    PostForm.bundle.update(model, cover.send(message), undefined)

  it('waits for the route, and goes with what it kept', () => {
    const waiting = submit(update(PostForm.initial, dropped(file())))
    expect([waiting.outMessage, waiting.model.submitPending]).toEqual([undefined, true])
    // Being found out, as a checked key is: not called missing beside its progress.
    expect(cover.field(waiting.model)._tag).toBe('Validating')
    const landed = step(waiting.model, ImageMessage.Uploaded({ attempt: 1, asset }))
    expect(landed.outMessage).toEqual({ _tag: 'Submitted', value: { cover: asset } })
  })

  it('goes nowhere when the send is cancelled, and says the key is missing', () => {
    const waiting = submit(update(PostForm.initial, dropped(file()))).model
    const cancelled = step(waiting, ImageMessage.Cancelled())
    expect([cancelled.outMessage, cancelled.model.submitPending]).toEqual([undefined, false])
    expect(cover.field(cancelled.model)).toMatchObject({ _tag: 'Invalid', errors: ['Required'] })
  })

  it('goes nowhere when the route refuses it', () => {
    const waiting = submit(update(PostForm.initial, dropped(file()))).model
    const refused = step(
      waiting,
      ImageMessage.Failed({ attempt: 1, reason: 'TooLarge', status: 413 }),
    )
    expect([refused.outMessage, refused.model.submitPending]).toEqual([undefined, false])
  })
})

describe('the image field drawn while a submit waits for it', () => {
  it('is marked busy, and says nothing of checking beside its own status', () => {
    const waiting = PostForm.bundle.update(
      update(PostForm.initial, dropped(file())),
      PostForm.Message.Submitted(),
      undefined,
    ).model
    const root = Inert.draw(FormView.define(PostForm), {
      model: waiting,
      errors: [],
      canSubmit: false,
    })
    const group = Inert.all(root).find(node => Inert.value(node, 'id') === 'PostForm-cover')
    expect(Inert.value(group, 'aria-busy')).toBe('true')
    expect(Inert.all(root).some(node => Inert.text(node) === 'Checking…')).toBe(false)
  })
})
