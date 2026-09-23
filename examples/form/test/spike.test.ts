// @vitest-environment jsdom
/**
 * Track 2 spike: what a stateful control needs from Form. The control itself
 * works (`colorPicker.ts`); these tests show how far the current Form API
 * carries it, so the missing pieces are evidence rather than guesswork.
 */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Bundle, Link } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Form, Input, type DraftKind } from 'foldkit-form'
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

describe('what Form cannot carry today', () => {
  const Post = Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, title: Schema.String, color: Schema.String }),
  )
  const PostInput = Schema.Struct({
    id: Schema.String,
    title: Post.fields.title.schema,
    color: Post.fields.color.schema,
  })
  const PostForm = Form.make('PostForm', Entity.input(Post, PostInput))

  it('holds a draft, not a child Model: the key has no room for the picker’s state', () => {
    const model = PostForm.bundle.init(undefined).model
    const field = PostForm.field(model, 'color')
    // A `FieldValidation.Field<string>`: the value is the text, and there is no
    // place for `open`, `recent`, or a Resource's requirements.
    expect(Object.keys(field).sort()).toEqual(['_tag', 'value'])
    expect(typeof field.value).toBe('string')
  })

  it('has no Message case a control could dispatch, so its intents cannot reach the form', () => {
    const tags = Object.keys(PostForm.Message)
    expect(tags).toEqual(
      expect.arrayContaining([
        'Changed',
        'Blurred',
        'Submitted',
        'Reset',
        'Checked',
        'Searched',
        'Nested',
      ]),
    )
    // Nothing a control defines: an `Opened` or a `Chose` has no route in.
    for (const tag of ['Opened', 'Closed', 'Chose', 'Resolved', 'Failed']) {
      expect(tags).not.toContain(tag)
    }
  })

  it('declares no Subscriptions and no Resources, so a control’s cannot run', () => {
    expect(PostForm.bundle.subscriptions).toBeUndefined()
    expect(PostForm.bundle.resources).toBeUndefined()
  })

  it('refuses a draft that is not text, a flag, or a list of ids', () => {
    // The type of `draft` is `'text' | 'flag' | 'list' | 'rows'`, so a control
    // that holds a child Model cannot be declared at all.
    const declared: ReadonlyArray<DraftKind> = ['text', 'flag', 'list', 'rows']
    expect(declared).toHaveLength(4)
    // @ts-expect-error A control's draft cannot be a child Model.
    Input.kind('ColorPicker', { draft: 'model' })
  })
})
