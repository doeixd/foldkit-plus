// @vitest-environment jsdom
/**
 * A press in the space below the last block: the caret goes to the end of a text block there,
 * and a document ending in anything else opens a paragraph after it.
 */
import { afterEach, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach } from '../src/events.js'
import { mount } from '../src/index.js'

const paragraph = (block: string, text: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text, marks: [] }],
})
const divider = { type: 'Node', kind: 'Divider', id: 'rule', props: {}, children: [] }

const setup = (...children: ReadonlyArray<unknown>) => {
  const dom = mount(document, RichText.decodeDocument({ version: 1, children }))
  document.body.append(dom.root)
  const moves: Array<RichText.Selection | null> = []
  const intents: Array<RichText.Command> = []
  attach(dom, { onIntent: intent => intents.push(intent), onSelection: move => moves.push(move) })
  // jsdom lays nothing out, so every block ends at 0 and a press at 10 is below them all.
  const press = (target: Element = dom.root, clientY = 10): MouseEvent => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY })
    target.dispatchEvent(event)
    return event
  }
  return { dom, moves, intents, press }
}
afterEach(() => document.body.replaceChildren())

it('puts the caret at the end of a last paragraph', () => {
  const { moves, intents, press } = setup(paragraph('first', 'One'), paragraph('last', 'Two'))
  expect(press().defaultPrevented).toBe(true)
  const end = { node: RichText.NodeId.make('last-t'), offset: 3, affinity: 'after' }
  expect(moves).toEqual([{ type: 'Range', anchor: end, focus: end }])
  expect(intents).toEqual([])
})

it('opens a paragraph after a last block that holds no text of its own', () => {
  const { moves, intents, press } = setup(paragraph('first', 'One'), divider)
  expect(press().defaultPrevented).toBe(true)
  expect(intents).toMatchObject([{ type: 'InsertBlock', to: { after: 'rule' } }])
  expect(moves).toEqual([])
})

it('leaves a press beside the blocks, or on one, to the browser', () => {
  const { dom, moves, intents, press } = setup(paragraph('only', 'One'))
  expect(press(dom.root, 0).defaultPrevented).toBe(false)
  expect(press(dom.root.firstElementChild!).defaultPrevented).toBe(false)
  expect([moves, intents]).toEqual([[], []])
})
