// @vitest-environment jsdom
/**
 * `UiForm.renderers`: every kind is drawn under its `foldkit-mixins-ui`
 * component's Slot, keeps what the plain control carries, posts the same
 * values, and sends the same Messages for the same interaction.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView, Style } from 'foldkit-mixins'
import {
  CheckboxGroupSlots,
  CheckboxSlots,
  InputSlots,
  SelectSlots,
  TextareaSlots,
} from 'foldkit-mixins-ui'
import { Frames, Inert } from 'foldkit-mixins/testing'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormView, type Renderers } from '../src/index.js'
import * as UiForm from '../src/ui.js'
import { Edit, options } from './fixture.js'

const styles: UiForm.UiStyles = {
  input: Style.forSlots(InputSlots)({ input: Style.class('ui-input') }),
  textarea: Style.forSlots(TextareaSlots)({ textarea: Style.class('ui-textarea') }),
  select: Style.forSlots(SelectSlots)({ select: Style.class('ui-select') }),
  checkbox: Style.forSlots(CheckboxSlots)({ checkbox: Style.class('ui-checkbox') }),
  checkboxGroup: Style.forSlots(CheckboxGroupSlots)({
    root: Style.class('ui-group'),
    checkbox: Style.class('ui-choice'),
  }),
}

const Pick = Form.make(
  'Pick',
  Form.input(Schema.Struct({ colours: Schema.Array(Schema.Literals(['red', 'green'])) })),
)

type EditModel = typeof Edit.initial
const edit = (...messages: ReadonlyArray<typeof Edit.Message.Type>): EditModel =>
  messages.reduce((model, message) => Edit.bundle.update(model, message, undefined).model, {
    ...Edit.initial,
  })
const drawEdit = (
  model: EditModel,
  renderers?: Renderers<typeof Edit.Message.Type>,
  locked?: ReadonlyArray<'featured' | 'tagIds'>,
): Html =>
  FormView.define(Edit, renderers === undefined ? {} : { renderers })(
    { model, errors: [], canSubmit: false, options, locked },
    SlotView.inertBuilder(),
  )
const ui = UiForm.renderers<typeof Edit.Message.Type>(styles)
const byId = (root: Html, id: string) =>
  Inert.all(root).find(node => Inert.value(node, 'id') === id)
const posts = (root: Html, name: string) =>
  Inert.byTag(root, 'input')
    .filter(node => Inert.value(node, 'type') === 'hidden' && Inert.value(node, 'name') === name)
    .map(node => Inert.value(node, 'value'))

describe('UiForm.renderers', () => {
  it("draws every kind under its component's Slot", () => {
    const root = drawEdit(Edit.initial, ui)
    const drawn = (id: string) => [byId(root, id)?.sel, Inert.classes(byId(root, id))]
    expect(drawn('Edit-title')).toEqual(['input', ['ui-input']])
    expect(drawn('Edit-rating')).toEqual(['input', ['ui-input']])
    expect(drawn('Edit-body')).toEqual(['textarea', ['ui-textarea']])
    expect(drawn('Edit-status')).toEqual(['select', ['ui-select']])
    expect(drawn('Edit-editorId')).toEqual(['select', ['ui-select']])
    expect(drawn('Edit-featured')).toEqual(['button', ['ui-checkbox']])
    expect(drawn('Edit-tagIds')).toEqual(['div', ['ui-group']])
    const picked = FormView.define(Pick, { renderers: UiForm.renderers(styles) })(
      { model: Pick.initial, errors: [], canSubmit: false },
      SlotView.inertBuilder(),
    )
    expect(Inert.classes(byId(picked, 'Pick-colours'))).toEqual(['ui-group'])
    expect(
      Inert.byRole(byId(picked, 'Pick-colours'), 'checkbox').map(box => Inert.classes(box)),
    ).toEqual([['ui-choice'], ['ui-choice']])
  })

  it('keeps the plain controls’ names, ids and accessibility state', () => {
    const root = drawEdit(edit(Edit.Message.Blurred({ key: 'title' })), ui)
    for (const key of ['title', 'rating', 'body', 'status', 'editorId'] as const)
      expect(Inert.value(byId(root, `Edit-${key}`), 'name'), key).toBe(key)
    const title = byId(root, 'Edit-title')
    expect(Inert.value(title, 'aria-invalid')).toBe('true')
    expect(Inert.value(title, 'aria-required')).toBe('true')
    expect(Inert.value(title, 'aria-describedby')).toBe('Edit-title-description Edit-title-error')
    const featured = byId(root, 'Edit-featured')
    expect(Inert.value(featured, 'role')).toBe('checkbox')
    expect(Inert.value(featured, 'aria-checked')).toBe('false')
    expect(Inert.value(featured, 'aria-invalid')).toBe('false')
    // The button posts nothing: its name is on the hidden input it holds when checked.
    expect(Inert.value(featured, 'name')).toBeUndefined()
    const tags = byId(root, 'Edit-tagIds')
    expect(Inert.value(tags, 'role')).toBe('group')
    expect(Inert.value(tags, 'aria-label')).toBe('Tags')
    expect(Inert.value(tags, 'aria-invalid')).toBe('false')
    // The plain group carries the same.
    expect(Inert.value(byId(drawEdit(Edit.initial), 'Edit-tagIds'), 'aria-invalid')).toBe('false')
    // A group is named by no key and is not required: its checkboxes post.
    expect([Inert.value(tags, 'name'), Inert.value(tags, 'aria-required')]).toEqual([
      undefined,
      undefined,
    ])
    // Each choice is named by its label.
    const boxes = Inert.byRole(tags, 'checkbox')
    expect(boxes.map(box => Inert.value(box, 'id'))).toEqual(['Edit-tagIds-0', 'Edit-tagIds-1'])
    expect(
      Inert.byTag(tags, 'label').map(label => [Inert.value(label, 'for'), Inert.text(label)]),
    ).toEqual([
      ['Edit-tagIds-0', 'TypeScript'],
      ['Edit-tagIds-1', 'Databases'],
    ])
  })

  it('posts what is checked, as the plain path does', () => {
    const model = edit(
      Edit.Message.Changed({ key: 'featured', value: true }),
      Edit.Message.Changed({ key: 'tagIds', value: ['t2'] }),
    )
    const root = drawEdit(model, ui)
    expect(posts(root, 'featured')).toEqual(['on'])
    expect(posts(root, 'tagIds')).toEqual(['t2'])
    expect(Inert.value(byId(root, 'Edit-featured'), 'aria-checked')).toBe('true')
    expect(
      Inert.byRole(byId(root, 'Edit-tagIds'), 'checkbox').map(box =>
        Inert.value(box, 'aria-checked'),
      ),
    ).toEqual(['false', 'true'])
    const unchecked = drawEdit(Edit.initial, ui)
    expect([posts(unchecked, 'featured'), posts(unchecked, 'tagIds')]).toEqual([[], []])
  })

  it('posts a locked key once, through the field, and offers it disabled', () => {
    const model = edit(
      Edit.Message.Changed({ key: 'featured', value: true }),
      Edit.Message.Changed({ key: 'tagIds', value: ['t2'] }),
    )
    for (const renderers of [undefined, ui]) {
      const root = drawEdit(model, renderers, ['featured', 'tagIds'])
      expect(posts(root, 'featured')).toEqual(['on'])
      expect(posts(root, 'tagIds')).toEqual(['t2'])
    }
    const root = drawEdit(model, ui, ['featured', 'tagIds'])
    expect(Inert.value(byId(root, 'Edit-featured'), 'disabled')).toBe(true)
    expect(
      Inert.byRole(byId(root, 'Edit-tagIds'), 'checkbox').map(box => Inert.value(box, 'disabled')),
    ).toEqual([true, true])
  })
})

describe('the same interaction on both paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  const element = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E
  const type = (id: string, value: string) => {
    const input = element<HTMLInputElement>(id)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const choose = (id: string, value: string) => {
    const select = element<HTMLSelectElement>(id)
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  // The control a label names: the one it is for, or the one inside it.
  const named = (words: string): HTMLElement => {
    const label = Array.from(document.querySelectorAll('label')).find(
      label => label.textContent === words,
    )!
    return label.htmlFor === '' ? label.querySelector('input')! : element(label.htmlFor)
  }

  const drive = async (renderers?: Renderers<typeof Edit.Message.Type>) => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const frames = Frames.track()
    const container = document.createElement('div')
    container.id = 'ui-renderers'
    document.body.append(container)
    const sent: Array<typeof Edit.Message.Type> = []
    const view = FormView.define(Edit, renderers === undefined ? {} : { renderers })
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: Edit.bundle.Model,
        container,
        init: () => ({ model: Edit.initial }),
        update: (model: EditModel, message: typeof Edit.Message.Type) => {
          sent.push(message)
          return { model: Edit.bundle.update(model, message, undefined).model }
        },
        view: (model: EditModel, h: HtmlBuilder<typeof Edit.Message.Type>) =>
          view({ model, errors: [], canSubmit: false, options }, h),
      }),
    )
    const drawn = () => vi.waitFor(() => expect(sent.length).toBeGreaterThan(0))
    try {
      await vi.waitFor(() => expect(element('Edit-title')).not.toBeNull())
      type('Edit-title', 'Hello')
      await drawn()
      element('Edit-title').dispatchEvent(new Event('blur'))
      type('Edit-rating', '4.')
      type('Edit-body', 'Words')
      choose('Edit-status', 'live')
      choose('Edit-editorId', 'a2')
      element('Edit-featured').click()
      named('Databases').click()
      // A press's Message carries the choices as drawn, so the next waits for this one's.
      await vi.waitFor(() => expect(sent).toHaveLength(8))
      await frames.settle()
      named('TypeScript').click()
      await vi.waitFor(() => expect(sent).toHaveLength(9))
      return sent
    } finally {
      handle.dispose()
      frames.dispose()
      document.body.replaceChildren()
    }
  }

  it('sends the same Messages through the UI table as through the plain renderers', async () => {
    const plain = await drive()
    const drawn = await drive(ui)
    expect(drawn).toEqual(plain)
    expect(plain.at(-1)).toEqual(Edit.Message.Changed({ key: 'tagIds', value: ['t2', 't1'] }))
  })
})
