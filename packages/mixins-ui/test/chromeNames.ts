/**
 * Names as Chrome's own accessibility tree has them, for a test of a claim
 * about a name: Vitest's locators compute names their own way, and read
 * generated text Chrome leaves out.
 */
import { cdp } from 'vitest/browser'

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type AxNode = {
  readonly role?: { readonly value?: string }
  readonly name?: { readonly value?: string }
}

/** The buttons' names as Chrome's own accessibility tree has them, in every frame. */
export const buttonNames = async () => {
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
    for (const node of nodes)
      if (node.role?.value === 'button') names.push(String(node.name?.value))
  }
  return names
}
