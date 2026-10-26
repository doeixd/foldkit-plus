/**
 * The image recipe's control through a real form: what each Message makes of
 * the key's draft and value. The upload itself is `upload.browser.test.ts`'s,
 * and the drawn control `image.browser.test.ts`'s.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { HashedAsset } from 'foldkit-media'
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
