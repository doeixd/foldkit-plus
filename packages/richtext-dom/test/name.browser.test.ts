/// <reference types="@vitest/browser-playwright" />
/**
 * The editor's accessible name in a real browser, as Chrome's own accessibility tree has it
 * (Vitest's locators compute names their own way): a `label`, a `labelledBy`, the label a form
 * draws for its control (markup as `foldkit-mixins-form` draws it), and no name at all.
 */
import { afterEach, expect, it } from 'vitest'
import { cdp } from 'vitest/browser'
import * as RichText from 'foldkit-richtext'
import { attach, type AttachOptions } from '../src/events.js'
import { mount } from '../src/index.js'

const content = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'Milk', marks: [] }],
    },
  ],
})

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type AxNode = {
  readonly role?: { readonly value?: string }
  readonly name?: { readonly value?: string }
}

/** The names of the text boxes in Chrome's accessibility tree, in every frame. */
const textboxNames = async (): Promise<ReadonlyArray<string>> => {
  await cdp().send('Accessibility.enable')
  const { frameTree } = (await cdp().send('Page.getFrameTree')) as { frameTree: Frame }
  const frames: Array<Frame> = []
  const walk = (frame: Frame) => {
    frames.push(frame)
    frame.childFrames?.forEach(walk)
  }
  walk(frameTree)
  const names: Array<string> = []
  for (const { frame } of frames) {
    const { nodes } = (await cdp().send('Accessibility.getFullAXTree', { frameId: frame.id })) as {
      nodes: ReadonlyArray<AxNode>
    }
    for (const node of nodes) {
      if (node.role?.value === 'textbox') names.push(String(node.name?.value ?? ''))
    }
  }
  return names
}

const draw = (
  options: Pick<AttachOptions, 'label' | 'labelledBy'> = {},
  parent: Element = document.body,
) => {
  const dom = mount(document, content)
  parent.append(dom.root)
  const attachment = attach(dom, { onIntent: () => {}, ...options })
  return { dom, attachment }
}

afterEach(() => {
  document.body.replaceChildren()
})

it('is named by its label', async () => {
  draw({ label: 'Body' })
  expect(await textboxNames()).toEqual(['Body'])
})

it('is named by the element it says labels it', async () => {
  const caption = document.createElement('span')
  caption.id = 'caption'
  caption.textContent = 'Notes'
  document.body.append(caption)
  draw({ labelledBy: 'caption' })
  expect(await textboxNames()).toEqual(['Notes'])
})

/** The markup a form draws around a control it labels: a group the label's `for` names. */
const formField = () => {
  const label = document.createElement('label')
  label.id = 'post-body-label'
  label.htmlFor = 'post-body'
  label.textContent = 'Body'
  const group = document.createElement('div')
  group.id = 'post-body'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-labelledby', 'post-body-label')
  document.body.append(label, group)
  return { label, group }
}

it('takes the label a form draws for its control, and a click on that label focuses it', async () => {
  const { label, group } = formField()
  const { dom } = draw({}, group)
  expect(await textboxNames()).toEqual(['Body'])
  expect(document.activeElement).not.toBe(dom.root)
  label.click()
  expect(document.activeElement).toBe(dom.root)
})

it('keeps its own label over the group’s', async () => {
  const { group } = formField()
  draw({ label: 'Own' }, group)
  expect(await textboxNames()).toEqual(['Own'])
})

it('stops listening to a label when it is detached', () => {
  const { label, group } = formField()
  const { dom, attachment } = draw({}, group)
  attachment.detach()
  label.click()
  expect(document.activeElement).not.toBe(dom.root)
})

it('has no name when none is given, and none is invented', async () => {
  draw()
  expect(await textboxNames()).toEqual([''])
})
