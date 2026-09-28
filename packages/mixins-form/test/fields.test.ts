import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FieldSlots, FormSlots, FormView, type FieldDrawer, type FormInput } from '../src/index.js'

const Note = Entity.define(
  'Note',
  Schema.Struct({
    title: Schema.String,
    body: Schema.String,
    email: Schema.String,
  }),
)
const NoteForm = Form.make(
  'Note',
  Entity.input(
    Note,
    Schema.Struct({
      title: Schema.String,
      body: Schema.String,
      email: Schema.String,
    }),
  ),
  { inputs: { body: Input.multiline() } },
)

type Model = typeof NoteForm.bundle.Model.Type
type NoteMessage = typeof NoteForm.Message.Type
type NoteKey = 'title' | 'body' | 'email'
const initial: Model = NoteForm.bundle.init(undefined).model

const byId = (root: Html, id: string): Node | undefined =>
  Inert.all(root).find(node => node.data?.props?.id === id)

const drawn = (root: Html, id: string) => {
  const node = byId(root, id)
  return node === undefined ? undefined : [node.sel, node.data?.props?.type]
}

const renderView = (
  view: SlotView.SlotView<typeof FormSlots, FormInput<Model, NoteKey>, NoteMessage>,
  model: Model = initial,
): Html =>
  view(
    { model, errors: model.errors, canSubmit: NoteForm.canSubmit(model), options: {} },
    SlotView.inertBuilder<NoteMessage>(),
  )

const controlOf = (key: 'title' | 'body' | 'email') => {
  const control = NoteForm.controls.find(control => control.key === key)
  if (control === undefined) throw new Error(`no ${key} control`)
  return control
}

describe('FormView.fields', () => {
  it('draws each key by its kind with no per-key map', () => {
    const Fields = FormView.fields(NoteForm)
    const root = renderView(Fields.view)
    expect(root?.sel).toBe('form')
    expect(drawn(root, 'Note-title')).toEqual(['input', 'text'])
    expect(drawn(root, 'Note-email')).toEqual(['input', 'text'])
    expect(drawn(root, 'Note-body')).toEqual(['textarea', undefined])
  })

  it('draws a key with its drawer, handing it the key’s Messages', () => {
    let changed: unknown
    let blurred: unknown
    const Fields = FormView.fields(NoteForm, {
      drawers: {
        body: (input, h) => {
          changed = input.changed('Hello')
          blurred = input.blurred
          return h.p([], ['custom-body'])
        },
      },
    })
    const root = renderView(Fields.view)
    expect(Inert.text(root)).toContain('custom-body')
    expect(byId(root, 'Note-body')).toBeUndefined()
    expect(drawn(root, 'Note-title')).toEqual(['input', 'text'])
    expect(changed).toEqual(NoteForm.Message.Changed({ key: 'body', value: 'Hello' }))
    expect(blurred).toEqual(NoteForm.Message.Blurred({ key: 'body' }))
  })

  it('styles one key’s field without touching the others', () => {
    const Fields = FormView.fields(NoteForm, {
      styles: {
        title: Style.forSlots(FieldSlots)({ root: Style.class('titled') }),
      },
    })
    const root = renderView(Fields.view)
    const titled = Inert.all(root).filter(node => Inert.classes(node).includes('titled'))
    expect(titled).toHaveLength(1)
    // The titled root holds the title control and no other key's.
    expect(Inert.all(titled[0]).some(node => node.data?.props?.id === 'Note-title')).toBe(true)
    expect(Inert.all(titled[0]).some(node => node.data?.props?.id === 'Note-email')).toBe(false)
  })

  it('draws one flat key for a layout the caller owns', () => {
    const Fields = FormView.fields(NoteForm)
    const h = SlotView.inertBuilder<NoteMessage>()
    const bodyDrawer: FieldDrawer<NoteKey, NoteMessage, NoteMessage> = (input, draw) =>
      draw.div(
        [draw.DataAttribute('drawer', 'body')],
        [draw.textarea([draw.Id(input.id), draw.Value(String(input.field.value))])],
      )
    const root = h.div(
      [],
      [
        Fields.field(controlOf('title'), initial, 'F-title', h),
        Fields.field(controlOf('body'), initial, 'F-body', h, bodyDrawer),
      ],
    )
    expect(drawn(root, 'F-title')).toEqual(['input', 'text'])
    expect(drawn(root, 'F-body')).toEqual(['textarea', undefined])
    expect(Inert.all(root).some(node => Inert.value(node, 'data-drawer') === 'body')).toBe(true)
  })

  it('refuses a nested key through field, naming it', () => {
    const Fields = FormView.fields(NoteForm)
    const nested = {
      ...controlOf('title'),
      control: { ...controlOf('title').control, kind: 'Nested' },
    }
    expect(() => Fields.field(nested, initial, 'F-title', SlotView.inertBuilder())).toThrow(
      'FormView.fields: "title" nests rows or a Bundle',
    )
  })
})
