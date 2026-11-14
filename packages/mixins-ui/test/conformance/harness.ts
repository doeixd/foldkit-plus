/**
 * The browser half of a `Conformance` harness: Vitest's keyboard and Chrome's
 * own accessibility tree, which Vitest's locators do not match (they name an
 * element their own way and read generated text Chrome leaves out).
 */
import type { Conformance } from 'foldkit-mixins/testing'
import { cdp, userEvent } from 'vitest/browser'

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type Property = { readonly name: string; readonly value: { readonly value?: unknown } }
type Node = {
  readonly ignored?: boolean
  readonly role?: { readonly value?: string }
  readonly name?: { readonly value?: string }
  readonly properties?: ReadonlyArray<Property>
}

const accessibility = async (): Promise<ReadonlyArray<Conformance.AxNode>> => {
  await cdp().send('Accessibility.enable')
  const { frameTree } = (await cdp().send('Page.getFrameTree')) as { frameTree: Frame }
  const frames: Array<Frame> = []
  const walk = (frame: Frame) => {
    frames.push(frame)
    frame.childFrames?.forEach(walk)
  }
  walk(frameTree)
  const found: Array<Conformance.AxNode> = []
  for (const { frame } of frames) {
    const { nodes } = (await cdp().send('Accessibility.getFullAXTree', { frameId: frame.id })) as {
      nodes: ReadonlyArray<Node>
    }
    for (const node of nodes) {
      if (node.ignored === true) continue
      found.push({
        role: String(node.role?.value),
        name: String(node.name?.value ?? ''),
        states: Object.fromEntries(
          (node.properties ?? []).map(property => [property.name, String(property.value.value)]),
        ),
      })
    }
  }
  return found
}

export const harness: Conformance.Harness = {
  root: document,
  press: keys => userEvent.keyboard(keys),
  accessibility,
  // `click()` and not a pointer press: Playwright refuses to press an `aria-disabled` element,
  // which is the case a disabled control must survive.
  click: async element => {
    ;(element as HTMLElement).click()
  },
}
