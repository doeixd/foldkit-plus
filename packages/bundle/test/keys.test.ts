/**
 * Collection keys and storage: branded keys, and an array identified by id
 * whose order views and Subscriptions follow.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { CounterMessage } from './fixture.js'

export const UploadId = Schema.String.pipe(Schema.brand('UploadId'))
export type UploadId = typeof UploadId.Type

const UploadModel = Schema.Struct({ id: UploadId, count: Schema.Number, running: Schema.Boolean })
type UploadModel = typeof UploadModel.Type
const Upload = Bundle.make('Upload', {
  Model: UploadModel,
  Message: CounterMessage,
  init: () => ({ model: { id: UploadId.make('pending'), count: 0, running: false } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
  helpers: { set: (model: UploadModel, count: number) => ({ model: { ...model, count } }) },
})

export const GotUploadMessage = Link.keyedWrapper('GotUploadMessage', CounterMessage, UploadId)
const Model = Schema.Struct({ uploads: Schema.Array(UploadModel) })
export type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotUploadMessage.cases })

export const Uploads = Upload.each(
  Link.collectionById<Model>()('uploads', GotUploadMessage, { id: upload => upload.id }),
)

const a = UploadId.make('a')
const b = UploadId.make('b')
const ten = UploadId.make('10')

describe('typed keys and array storage', () => {
  it('starts an array collection as [] in initial', () => {
    const placements = Bundle.assemble<Model, typeof Message.Type>()([Uploads])
    expect(placements.initial({}).model).toEqual({ uploads: [] })
  })

  it('appends new ids in order and keeps that order, even for integer-like ids', () => {
    const empty: Model = { uploads: [] }
    const added = [b, ten, a].reduce(
      (model, id) => Uploads.add(id, upload => ({ ...upload, id }))(model).model,
      empty,
    )
    expect(added.uploads.map(upload => upload.id)).toEqual(['b', '10', 'a'])
    expect(Uploads.link.entries(added).map(([id]) => id)).toEqual(['b', '10', 'a'])
  })

  it('updates an item in place, removes by id, and ignores a Message for a missing id', () => {
    const model: Model = {
      uploads: [
        { id: a, count: 0, running: false },
        { id: b, count: 0, running: false },
      ],
    }
    const updated = Option.getOrThrow(
      Uploads.update(model, GotUploadMessage.make(b, CounterMessage.Incremented())),
    )
    expect(updated.model.uploads.map(upload => upload.count)).toEqual([0, 1])
    expect(Uploads.helpers.set(a, 5)(model).model.uploads[0]!.count).toBe(5)
    const removed = Uploads.remove(a)(model).model
    expect(removed.uploads.map(upload => upload.id)).toEqual(['b'])
    const late = Option.getOrThrow(
      Uploads.update(removed, GotUploadMessage.make(a, CounterMessage.Incremented())),
    )
    expect(late.model).toBe(removed)
  })

  it('decodes the branded key as part of the parent Message', () => {
    const decoded = Schema.decodeUnknownSync(Message)({
      _tag: 'GotUploadMessage',
      key: 'a',
      message: { _tag: 'Incremented' },
    })
    expect(decoded).toEqual(GotUploadMessage.make(a, CounterMessage.Incremented()))
  })
})
