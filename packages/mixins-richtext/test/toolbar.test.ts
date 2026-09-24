// @vitest-environment jsdom
/**
 * The mark toolbar family: what it draws, the slots it publishes, and that a click
 * reaches the caller's Message.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, SlotView, Style } from 'foldkit-mixins'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import * as RichText from 'foldkit-richtext'
import { describe, expect, it } from 'vitest'
import { MarkToolbarSlots, markToolbar, type MarkToolbarInput } from '../src/index.js'

const Message = defineMessageUnion({ Toggled: { mark: Schema.String } })
type Message = typeof Message.Type

/** A rendered vnode, as much of it as these tests read. */
interface Node {
  readonly sel?: string
  readonly text?: string
  readonly data?: {
    readonly attrs?: Readonly<Record<string, unknown>>
    readonly class?: Readonly<Record<string, boolean>>
  }
  readonly children?: ReadonlyArray<Node>
}

const all = (node: Node): ReadonlyArray<Node> => [node, ...(node.children ?? []).flatMap(all)]
const buttons = (root: Node): ReadonlyArray<Node> => all(root).filter(node => node.sel === 'button')
const named = (root: Node, mark: string): Node | undefined =>
  buttons(root).find(node => node.data?.attrs?.['data-mark'] === mark)
const classes = (node: Node | undefined): ReadonlyArray<string> =>
  Object.keys(node?.data?.class ?? {})

const id = RichText.NodeId.make

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

const state = (
  selection: RichText.Selection | null,
  storedMarks: ReadonlyArray<string> | null = null,
): MarkToolbarInput<Message>['state'] => ({
  document: RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        ],
      },
    ],
  }),
  selection,
  storedMarks,
})

const input = (overrides: Partial<MarkToolbarInput<Message>> = {}): MarkToolbarInput<Message> => ({
  state: state(caret('b', 1)),
  toggled: mark => Message.Toggled({ mark }),
  ...overrides,
})

const render = (
  view = markToolbar<Message>(),
  overrides: Partial<MarkToolbarInput<Message>> = {},
): Node => view(input(overrides), SlotView.inertBuilder()) as unknown as Node

describe('the mark toolbar family', () => {
  it('draws a button per mark, the caret\u2019s mark pressed', () => {
    const root = render()
    expect(root.sel).toBe('div')
    expect(buttons(root).map(node => node.data?.attrs?.['data-mark'])).toEqual([
      'Bold',
      'Italic',
      'Code',
    ])
    expect(named(root, 'Bold')?.data?.attrs?.['aria-pressed']).toBe('true')
    expect(named(root, 'Italic')?.data?.attrs?.['aria-pressed']).toBe('false')
  })

  it('lets the stored format win over the run under the caret', () => {
    const root = render(markToolbar<Message>(), { state: state(caret('a', 1), ['Italic']) })
    expect(named(root, 'Italic')?.data?.attrs?.['aria-pressed']).toBe('true')
    expect(named(root, 'Bold')?.data?.attrs?.['aria-pressed']).toBe('false')
  })

  it('offers exactly the marks it is given', () => {
    const root = render(markToolbar<Message>(), { marks: ['Code'] })
    expect(buttons(root).map(node => node.data?.attrs?.['data-mark'])).toEqual(['Code'])
  })

  it('takes a Style on its slots', () => {
    const styled = markToolbar<Message>().pipe(
      Style.attach(Style.forSlots(MarkToolbarSlots)({ button: Style.class('mark-button') })),
    )
    expect(classes(named(render(styled), 'Bold'))).toEqual(['mark-button'])
  })

  it('hands a Behavior each button\u2019s mark as its slot item id', () => {
    const labelled = markToolbar<Message>().pipe(
      Behavior.attach(
        Behavior.forSlots(MarkToolbarSlots)<MarkToolbarInput<Message>, Message>({
          button: Behavior.slot({
            requires: { capability: Capability.Interactive },
            attributes: ({ item, h }) => [h.DataAttribute('mark-id', item?.id ?? '')],
          }),
        }),
      ),
    )
    const root = render(labelled)
    expect(named(root, 'Bold')?.data?.attrs?.['data-mark-id']).toBe('Bold')
    expect(named(root, 'Code')?.data?.attrs?.['data-mark-id']).toBe('Code')
  })
})

describe('the mark toolbar in an application', () => {
  interface Model {
    readonly state: MarkToolbarInput<Message>['state']
    readonly last: string
  }
  const update = (model: Model, message: Message): { readonly model: Model } => ({
    model: { ...model, last: message.mark },
  })
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        markToolbar<Message>()(
          { state: model.state, toggled: mark => Message.Toggled({ mark }) },
          h,
        ),
        h.p([h.Id('last')], [model.last]),
      ],
    )

  it('dispatches the mark its button names', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ state: state(caret('a', 1)), last: '' }),
      Scene.click('[data-mark="Italic"]'),
      Scene.expect(Scene.selector('#last')).toHaveText('Italic'),
    )
  })
})
