import { Attr, Behavior, Capability, SlotView, Style } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { FieldSlots, FormSlots, FormView, type FieldInput } from '../src/index.js'
import { Edit, options } from './fixture.js'

interface Node {
  readonly sel?: string
  readonly text?: string
  readonly data?: {
    readonly props?: Readonly<Record<string, unknown>>
    readonly attrs?: Readonly<Record<string, unknown>>
    readonly class?: Readonly<Record<string, boolean>>
  }
  readonly children?: ReadonlyArray<Node>
}

const all = (node: Node): ReadonlyArray<Node> => [node, ...(node.children ?? []).flatMap(all)]
const byId = (root: Node, id: string): Node | undefined =>
  all(root).find(node => node.data?.props?.id === id)
const text = (node: Node | undefined): string =>
  node === undefined
    ? ''
    : all(node)
        .map(child => child.text ?? '')
        .join('')
const classes = (node: Node | undefined): ReadonlyArray<string> =>
  Object.keys(node?.data?.class ?? {})

const initial = Edit.bundle.init(undefined).model
const send = (...messages: ReadonlyArray<typeof Edit.Message.Type>) =>
  messages.reduce((model, message) => Edit.bundle.update(model, message, undefined).model, initial)
const render = (model = initial, view = FormView.define(Edit)): Node =>
  view(
    { model, errors: model.errors, canSubmit: Edit.canSubmit(model), options },
    SlotView.inertBuilder(),
  ) as unknown as Node

describe('FormView markup', () => {
  it('draws each control as the element its kind calls for, and leaves a hidden key out', () => {
    const root = render()
    const drawn = (id: string) => {
      const node = byId(root, id)
      return [node?.sel, node?.data?.props?.type]
    }

    expect(root.sel).toBe('form')
    expect(byId(root, 'Edit-id')).toBeUndefined()
    expect(drawn('Edit-title')).toEqual(['input', 'text'])
    expect(drawn('Edit-body')).toEqual(['textarea', undefined])
    expect(drawn('Edit-status')).toEqual(['select', undefined])
    expect(drawn('Edit-rating')).toEqual(['input', 'text'])
    expect(drawn('Edit-featured')).toEqual(['input', 'checkbox'])
    expect(drawn('Edit-editorId')).toEqual(['select', undefined])
    expect(drawn('Edit-tagIds')).toEqual(['div', undefined])
  })

  it('offers a select its own literals, and a picker the options from the view inputs', () => {
    const root = render()
    const offered = (id: string) =>
      (byId(root, id)?.children ?? []).map(option => [option.data?.props?.value, text(option)])

    // Nothing is chosen yet, so even the required `status` offers a blank: without
    // one the browser would show "draft" as chosen while the draft is empty.
    expect(offered('Edit-status')).toEqual([
      ['', ''],
      ['draft', 'draft'],
      ['live', 'live'],
    ])
    const chosen = render(send(Edit.Message.Changed({ key: 'status', value: 'live' })))
    expect(
      (byId(chosen, 'Edit-status')?.children ?? []).map(option => option.data?.props?.value),
    ).toEqual(['draft', 'live'])
    expect(offered('Edit-editorId')).toEqual([
      ['', ''],
      ['a1', 'Ada'],
      ['a2', 'Grace'],
    ])
    expect(text(byId(root, 'Edit-tagIds'))).toBe('TypeScriptDatabases')
  })

  it('shows the draft: a value, a checked box, a selected option, the chosen ids', () => {
    const root = render(
      send(
        Edit.Message.Changed({ key: 'title', value: 'Hello' }),
        Edit.Message.Changed({ key: 'featured', value: true }),
        Edit.Message.Changed({ key: 'editorId', value: 'a2' }),
        Edit.Message.Changed({ key: 'tagIds', value: ['t2'] }),
      ),
    )
    const selected = (byId(root, 'Edit-editorId')?.children ?? []).flatMap(option =>
      option.data?.props?.selected === true ? [option.data.props.value] : [],
    )
    const checked = all(byId(root, 'Edit-tagIds') ?? {}).flatMap(node =>
      node.sel === 'input' ? [node.data?.props?.checked] : [],
    )

    expect(byId(root, 'Edit-title')?.data?.props?.value).toBe('Hello')
    expect(byId(root, 'Edit-featured')?.data?.props?.checked).toBe(true)
    expect(selected).toEqual(['a2'])
    expect(checked).toEqual([false, true])
  })

  it('labels each control, and ties its description and error to it for a screen reader', () => {
    const calm = render()
    const label = all(calm).find(node => node.data?.props?.htmlFor === 'Edit-title')
    expect(text(label)).toBe('Title')
    expect(text(byId(calm, 'Edit-title-description'))).toBe('Shown in the feed')
    expect(byId(calm, 'Edit-title')?.data?.attrs).toMatchObject({
      'aria-invalid': 'false',
      'aria-required': 'true',
      'aria-describedby': 'Edit-title-description',
    })
    expect(byId(calm, 'Edit-title-error')).toBeUndefined()
    expect(byId(calm, 'Edit-tagIds')?.data?.attrs).toMatchObject({
      role: 'group',
      'aria-label': 'Tags',
    })

    const failed = render(send(Edit.Message.Blurred({ key: 'title' })))
    expect(byId(failed, 'Edit-title')?.data?.attrs).toMatchObject({
      'aria-invalid': 'true',
      'aria-describedby': 'Edit-title-description Edit-title-error',
    })
    expect(text(byId(failed, 'Edit-title-error'))).toBe('Required')
    expect(byId(failed, 'Edit-title-error')?.data?.attrs).toMatchObject({ role: 'alert' })
  })

  it('marks a control busy while its check runs', () => {
    const checking = {
      ...initial,
      fields: { ...initial.fields, title: { _tag: 'Validating' as const, value: 'Hello' } },
    }
    expect(byId(render(checking), 'Edit-title')?.data?.attrs).toMatchObject({ 'aria-busy': 'true' })
    expect(byId(render(), 'Edit-title')?.data?.attrs?.['aria-busy']).toBeUndefined()
  })

  it('disables the submit until the form would submit, and takes its label', () => {
    const button = (root: Node) => all(root).find(node => node.sel === 'button')
    expect(button(render())?.data?.props?.disabled).toBe(true)
    expect(text(button(render()))).toBe('Submit')

    const ready = send(
      Edit.Message.Changed({ key: 'title', value: 'Hello' }),
      Edit.Message.Changed({ key: 'status', value: 'draft' }),
    )
    const saved = FormView.define(Edit)(
      { model: ready, errors: [], canSubmit: Edit.canSubmit(ready), submitLabel: 'Save' },
      SlotView.inertBuilder(),
    ) as unknown as Node
    expect(button(saved)?.data?.props?.disabled).toBe(false)
    expect(text(button(saved))).toBe('Save')
  })
})

describe('FormView styling', () => {
  it('takes Style on the slots of the form and of a field, by input', () => {
    const Field = FormView.field(Edit).pipe(
      Style.attach(
        Style.forSlots(FieldSlots)({
          root: Style.class('field'),
          text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
        }),
      ),
    )
    const View = FormView.define(Edit, { field: Field }).pipe(
      Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
    )

    const root = render(send(Edit.Message.Blurred({ key: 'title' })), View)
    expect(classes(root)).toEqual(['form'])
    expect(classes(byId(root, 'Edit-title'))).toEqual(['is-invalid'])
    expect(classes(byId(root, 'Edit-rating'))).toEqual([])
    expect(all(root).filter(node => classes(node).includes('field'))).toHaveLength(7)
  })

  it('takes a Behavior that adds to a control, and refuses one that takes over its wiring', () => {
    type Message = typeof Edit.Message.Type
    type Key = (typeof Edit.controls)[number]['key']
    const behaviors = Behavior.forSlots(FieldSlots)<FieldInput<Key>, Message>
    const Tracked = behaviors({
      text: Behavior.slot({
        requires: { capability: Capability.TextInput },
        attributes: ({ input, h }) => [h.DataAttribute('field', input.control.key)],
      }),
    })
    const Overriding = behaviors({
      text: Behavior.slot({
        requires: { attributes: [Attr.AriaInvalid] },
        attributes: ({ h }) => [h.AriaInvalid(false)],
      }),
    })
    const withField = (behavior: typeof Tracked) =>
      FormView.define(Edit, { field: FormView.field(Edit).pipe(Behavior.attach(behavior)) })

    const tracked = byId(render(initial, withField(Tracked)), 'Edit-title')
    expect(tracked?.data?.attrs).toMatchObject({ 'data-field': 'title' })
    expect(() => render(initial, withField(Overriding))).toThrow('two owners for "AriaInvalid"')
  })
})
