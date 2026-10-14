// @vitest-environment jsdom
/**
 * A block's adornments (`ElementRendering.adornments`): drawn before its content and outside every
 * position, kept equal between `mount` and server markup, and a click on an adornment that toggles
 * a prop flips it through the document.
 */
import { Effect } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach } from '../src/events.js'
import { parseHtml } from '../src/html.js'
import { adopt, mount, patch, rangeToPosition, repair, toText } from '../src/index.js'
import { replaceChangeSet } from '../src/editor-bundle.js'
import { renderEditable } from '../src/view.js'

const id = RichText.NodeId.make
const rendering = RichText.renderingOver(RichText.standardRendering, {
  nodes: {
    Task: block => ({
      tag: 'div',
      attributes: { 'data-task': '' },
      adornments: [
        {
          tag: 'input',
          attributes: { type: 'checkbox', ...(block.props.done === true ? { checked: '' } : {}) },
          toggles: 'done',
        },
        { tag: 'span', attributes: { 'aria-hidden': 'true' }, text: '✦' },
      ],
    }),
  },
})
const task = (done: boolean) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'Task',
        id: 'task',
        props: { done },
        children: [{ type: 'Text', id: 'run', text: 'Water', marks: [] }],
      },
    ],
  } as never)

const block = (dom: ReturnType<typeof mount>) => dom.elements.get(id('task'))!
const checkbox = (dom: ReturnType<typeof mount>) =>
  block(dom).querySelector<HTMLInputElement>('input')!

describe('adornments in the editable subtree', () => {
  it('is drawn before the runs, not editable, and naming the prop it toggles', () => {
    const dom = mount(document, task(true), rendering)
    const children = Array.from(block(dom).children)
    expect(children.map(child => child.tagName.toLowerCase())).toEqual(['input', 'span', 'span'])
    expect(checkbox(dom).getAttribute('contenteditable')).toBe('false')
    expect(checkbox(dom).getAttribute('data-toggles')).toBe('done')
    expect(checkbox(dom).hasAttribute('checked')).toBe(true)
    expect(children[2]!.getAttribute('data-run')).toBe('run')
  })

  it('is not text: toText and a repair read past it', () => {
    const dom = mount(document, task(false), rendering)
    expect(toText(dom)).toBe('Water')
    expect(repair(dom, dom.content)).toBe(dom)
  })

  it('holds no position: a caret on the block before its adornments is the start of its text', () => {
    const dom = mount(document, task(false), rendering)
    expect(rangeToPosition(dom, block(dom), 0)).toEqual({
      node: id('run'),
      offset: 0,
      affinity: 'before',
    })
    expect(rangeToPosition(dom, checkbox(dom).nextElementSibling!.firstChild!, 0)).toBeUndefined()
  })

  it('is drawn again when what it draws changes', () => {
    const dom = mount(document, task(false), rendering)
    const done = task(true)
    const next = patch(dom, done, replaceChangeSet(dom.content, done))
    expect(checkbox(next).hasAttribute('checked')).toBe(true)
  })

  it('is the same in server markup, which is adopted', async () => {
    const rendered = await Effect.runPromise(
      renderToString(
        {
          init: () => ({ model: {} }),
          view: (_: {}, h: HtmlBuilder<never>) => ({
            title: 'x',
            body: h.div([h.Id('host')], [renderEditable(task(true), rendering)]),
          }),
        },
        { isHydratable: false },
      ),
    )
    const page = new DOMParser().parseFromString(rendered.html, 'text/html')
    const element = document.importNode(page.getElementById('host')!.firstElementChild!, true)
    expect(adopt(element, task(true), rendering)?.root).toBe(element)
  })

  it('is left out of imported HTML', () => {
    let next = 0
    const { blocks } = parseHtml(
      '<p><span data-adornment="">✦</span>Water</p><figure><img data-adornment="" src="/a.png"></figure>',
      { mint: () => `m${next++}` },
    )
    expect(RichText.toText(blocks)).toBe('Water')
  })
})

describe('a click on an adornment', () => {
  const clicked = (done: boolean, target: (dom: ReturnType<typeof mount>) => Element) => {
    const dom = mount(document, task(done), rendering)
    document.body.replaceChildren(dom.root)
    const intents: Array<RichText.Command> = []
    const attachment = attach(dom, { onIntent: command => intents.push(command) })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    target(dom).dispatchEvent(click)
    attachment.detach()
    return { intents, prevented: click.defaultPrevented }
  }

  it.each([
    ['ticks an unticked box', false, true],
    ['unticks a ticked one', true, false],
  ])('%s, as a SetProps the document applies', (_, done, flipped) => {
    const { intents, prevented } = clicked(done, checkbox)
    expect(intents).toEqual([{ type: 'SetProps', node: id('task'), props: { done: flipped } }])
    expect(prevented).toBe(true)
  })

  it('on an adornment that toggles nothing, or on the text, sends nothing', () => {
    expect(clicked(false, dom => checkbox(dom).nextElementSibling!).intents).toEqual([])
    expect(clicked(false, dom => dom.elements.get(id('run'))!).intents).toEqual([])
  })
})
