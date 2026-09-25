// @vitest-environment jsdom
/**
 * Track 2: a stateful control as a Form key. The control works on its own and
 * under a plain parent (`colorPicker.ts`); the last block is the acceptance
 * test for `Input.bundle`, which carries all of it through a form.
 */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Bundle, Link } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Form, Input } from 'foldkit-form'
import { ColorPicker, Message as ColorMessage, Model as ColorModel } from '../src/colorPicker.js'

describe('the control on its own', () => {
  it('holds its own state and emits a Command for a lookup', () => {
    const initial = ColorPicker.init().model
    const chosen = ColorPicker.update(initial, ColorMessage.Chose({ hex: '#ff0000' }))
    expect(chosen.model.hex).toBe('#ff0000')
    expect(chosen.commands).toHaveLength(1)
    expect(chosen.commands?.[0]?.name).toBe('palette.lookup')

    // The Command's fact lands back in the Model, and the palette is kept.
    const resolved = ColorPicker.update(chosen.model, ColorMessage.Resolved({ hex: '#ff0000' }))
    expect(resolved.model.recent).toEqual(['#ff0000'])
  })

  it('declares a Subscription while open and a Resource while a picker exists', () => {
    expect(Object.keys(ColorPicker.subscriptions?.() ?? {})).toEqual(['keys'])
    expect(Object.keys(ColorPicker.resources?.() ?? {})).toEqual(['palette'])
  })
})

describe('the control under a plain parent', () => {
  const GotPicker = Link.wrapper('GotPickerMessage', ColorMessage)
  const ParentModel = Schema.Struct({ color: ColorModel })
  type ParentModel = typeof ParentModel.Type
  const ParentMessage = defineMessageUnion({ ...GotPicker.cases })
  type ParentMessage = typeof ParentMessage.Type

  const picker = ColorPicker.at(Link.field<ParentModel>()('color', GotPicker))
  const application = Bundle.assemble<ParentModel, ParentMessage>()([picker])
  const update = application.update()

  it('keeps the control in the parent Model and routes its Messages', () => {
    const initial = application.initial({ color: ColorPicker.init().model }).model
    const opened = update(initial, GotPicker.make(ColorMessage.Opened())).model
    expect(opened.color.open).toBe(true)

    const chosen = update(opened, GotPicker.make(ColorMessage.Chose({ hex: '#00ff00' }))).model
    expect(chosen.color.hex).toBe('#00ff00')
    // The control's own Command was lifted to the parent, which runs it.
    expect(
      update(opened, GotPicker.make(ColorMessage.Chose({ hex: '#00ff00' }))).commands,
    ).toHaveLength(1)
  })

  it('carries the control’s Subscription and Resource through the placement', () => {
    const subscriptions = application.subscriptions()
    const resources = application.resources()
    expect(Object.keys(subscriptions).some(key => key.startsWith('ColorPicker@'))).toBe(true)
    expect(Object.keys(resources).some(key => key.startsWith('ColorPicker@'))).toBe(true)
  })
})

describe('the control as a Form key, through Input.bundle', () => {
  const Post = Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, title: Schema.String, color: Schema.String }),
  )
  const PostInput = Schema.Struct({
    title: Post.fields.title.schema,
    color: Post.fields.color.schema.check(Schema.isPattern(/^#[0-9a-f]{6}$/)),
  })
  const ColorInput = Input.bundle('ColorPicker', {
    bundle: ColorPicker,
    value: model => model.hex,
    fill: (model, hex) => ({ ...model, hex }),
    settled: model => ({ ...model, open: false }),
  })
  const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
    inputs: { color: ColorInput },
  })
  const color = PostForm.control('color')
  type FormModel = typeof PostForm.initial
  const update = (model: FormModel, message: typeof PostForm.Message.Type) =>
    PostForm.bundle.update(model, message, undefined)

  it('holds the picker’s Model as the key’s draft, with room for all of its state', () => {
    expect(color.field(PostForm.initial).value).toEqual({
      open: false,
      hex: '#000000',
      recent: [],
    })
  })

  it('routes the picker’s Messages, and lifts its Command as the form’s', () => {
    const opened = update(PostForm.initial, color.send(ColorMessage.Opened())).model
    expect(color.field(opened).value.open).toBe(true)
    // Opening changes no value: not an edit, so nothing to autosave.
    expect(PostForm.authoredChanged(PostForm.initial, opened)).toBe(false)

    const chosen = update(opened, color.send(ColorMessage.Chose({ hex: '#ff0000' })))
    expect(chosen.commands?.map(command => command.name)).toEqual(['palette.lookup'])
    expect(PostForm.authoredChanged(opened, chosen.model)).toBe(true)
    expect(color.field(chosen.model)._tag).toBe('Valid')
  })

  it('runs the picker’s Subscription and Resource as the form’s', () => {
    expect(Object.keys(PostForm.bundle.subscriptions?.(undefined) ?? {})).toEqual([
      'ColorPicker@fields.color/keys',
    ])
    expect(Object.keys(PostForm.bundle.resources?.(undefined) ?? {})).toEqual([
      'ColorPicker@fields.color/palette',
    ])
  })

  it('validates, fills, submits and saves the key by the value the picker holds', () => {
    const odd = update(PostForm.initial, color.send(ColorMessage.Chose({ hex: 'red' }))).model
    expect(color.field(odd)._tag).toBe('Invalid')

    const filled = PostForm.fill(PostForm.initial, { title: 'Hi', color: '#00ff00' }).model
    expect(PostForm.partial(filled)).toEqual({ title: 'Hi', color: '#00ff00' })
    expect(update(filled, PostForm.Message.Submitted()).outMessage).toEqual({
      _tag: 'Submitted',
      value: { title: 'Hi', color: '#00ff00' },
    })
  })

  it('resumes a stored form with the picker closed and its palette kept', () => {
    const opened = update(PostForm.initial, color.send(ColorMessage.Opened())).model
    const resolved = update(opened, color.send(ColorMessage.Resolved({ hex: '#123456' }))).model
    const stored = Schema.encodeSync(PostForm.bundle.Model)(resolved)
    const resumed = PostForm.settled(Schema.decodeUnknownSync(PostForm.bundle.Model)(stored))
    expect(color.field(resumed).value).toEqual({
      open: false,
      hex: '#123456',
      recent: ['#123456'],
    })
  })
})
