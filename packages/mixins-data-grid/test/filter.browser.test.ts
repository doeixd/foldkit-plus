/// <reference types="@vitest/browser-playwright" />
/**
 * The filter form in a real browser, where focus is real: Alt+ArrowDown on a
 * header opens it with focus in its first field, typing filters the rows,
 * Tab walks its controls and leaving it closes it, Escape hands focus back
 * to the grid on its header, and a press on an option keeps the form open.
 * Chrome's own accessibility tree names the header by its words alone, says
 * it is filtered, and names the form.
 */
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { buttonOf, form, grid, headerOf, mountTasks, shownRows } from './filterGrid.js'

beforeEach(() => {
  const css = document.createElement('style')
  css.id = 'filter-css'
  css.textContent = Style.stylesheet(Theme.root(Theme.standard()), GridStyle)
  document.head.appendChild(css)
})
afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelector('#filter-css')?.remove()
})

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type AxNode = {
  readonly ignored?: boolean
  readonly name?: { readonly value?: unknown }
  readonly description?: { readonly value?: unknown }
  readonly role?: { readonly value?: string }
}
/** Chrome's accessibility tree, every frame's: what a screen reader is told. */
const axNodes = async (): Promise<ReadonlyArray<AxNode>> => {
  await cdp().send('Accessibility.enable')
  const { frameTree } = (await cdp().send('Page.getFrameTree')) as { frameTree: Frame }
  const frames: Array<Frame> = []
  const walk = (frame: Frame) => {
    frames.push(frame)
    frame.childFrames?.forEach(walk)
  }
  walk(frameTree)
  const all: Array<AxNode> = []
  for (const { frame } of frames) {
    const { nodes } = (await cdp().send('Accessibility.getFullAXTree', { frameId: frame.id })) as {
      nodes: ReadonlyArray<AxNode>
    }
    all.push(...nodes.filter(node => node.ignored !== true))
  }
  return all
}
const said = (node: AxNode | undefined) => ({
  name: node?.name?.value,
  description: node?.description?.value,
})
const field = () => form()?.querySelector('input') ?? null

/** Focus on the grid's first cell, then up onto the Title header. */
const toTitleHeader = async () => {
  await userEvent.tab()
  expect(document.activeElement).toBe(grid())
  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() =>
    expect(grid().getAttribute('aria-activedescendant')).toBe(headerOf('title').id),
  )
}

test('Alt+ArrowDown opens the form with focus in its field; typing filters, Escape returns', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1', 't2']))
    await toTitleHeader()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    await userEvent.keyboard('bolt')
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't2']))

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(form()).toBeNull())
    expect(document.activeElement).toBe(grid())
    expect(grid().getAttribute('aria-activedescendant')).toBe(headerOf('title').id)
    // The filter stays: closing the form is not clearing it.
    expect(shownRows()).toEqual(['t0', 't2'])
    expect(mounted.latest().grid.filtering._tag).toBe('None')
  } finally {
    mounted.dispose()
  }
})

test('Tab walks the form and, leaving it, closes it', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    await toTitleHeader()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    await userEvent.keyboard('paint')
    // A filter holds, so Clear is drawn after the field.
    const clear = await vi.waitFor(() => {
      const button = form()?.querySelector('button')
      expect(button).toBeTruthy()
      return button!
    })
    await userEvent.tab()
    expect(document.activeElement).toBe(clear)
    expect(form()).not.toBeNull()
    await userEvent.tab()
    await vi.waitFor(() => expect(form()).toBeNull())
  } finally {
    mounted.dispose()
  }
})

test('a press on an option ticks it and keeps the form open', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    await userEvent.click(buttonOf('status'))
    const boxes = await vi.waitFor(() => {
      const found = form()?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
      expect(found).toHaveLength(3)
      return [...found]
    })
    // The first option holds focus as the form opens.
    expect(document.activeElement).toBe(boxes[0])
    await userEvent.click(boxes[2]!)
    await vi.waitFor(() => expect(shownRows()).toEqual(['t1']))
    expect(form()).not.toBeNull()
    expect(boxes[2]!.checked).toBe(true)
    // Space on a focused option ticks it too.
    boxes[0]!.focus()
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(shownRows()).toEqual(['t0', 't1']))
  } finally {
    mounted.dispose()
  }
})

test('Chrome names the header by its words, says it is filtered, and names the form', async () => {
  const mounted = mountTasks()
  try {
    await vi.waitFor(() => expect(shownRows()).toHaveLength(3))
    await userEvent.click(buttonOf('title'))
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    await userEvent.keyboard('bolt')
    await vi.waitFor(async () => {
      const nodes = await axNodes()
      const header = nodes.find(
        node => node.role?.value === 'columnheader' && node.name?.value === 'Title',
      )
      // The form's words and the buttons are not the header's name.
      expect(said(header)).toEqual({ name: 'Title', description: 'Filtered' })
      const dialog = nodes.find(node => node.role?.value === 'dialog')
      expect(said(dialog).name).toBe('Filter Title')
      const box = nodes.find(node => node.role?.value === 'textbox')
      expect(said(box).name).toBe('Contains')
    })
    // An unfiltered header says only what it said before: here, that it does not edit.
    const nodes = await axNodes()
    const hours = nodes.find(
      node => node.role?.value === 'columnheader' && node.name?.value === 'Hours',
    )
    expect(said(hours)).toEqual({ name: 'Hours', description: 'Read-only' })
  } finally {
    mounted.dispose()
  }
})
