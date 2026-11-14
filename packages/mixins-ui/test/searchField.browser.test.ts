/// <reference types="@vitest/browser-playwright" />
/**
 * SearchField in a real browser: Escape clears and keeps focus, an empty
 * field lets Escape reach a parent, pressing the clear button hands focus
 * back to the input, and the recipe draws one clear control at the inline
 * end with a focus ring.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Recipes, SearchField, SearchFieldSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(SearchFieldSlots)(Recipes.SearchField({}))

const Model = Schema.Struct({ value: Schema.String })
const Msg = defineMessageUnion({
  Typed: { text: Schema.String },
  Cleared: {},
  Opened: {},
  CompletedFocus: {},
})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.body.removeAttribute('dir')
})

const mount = (options: { readonly disabled?: boolean; readonly dir?: 'rtl' } = {}) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'search-browser'
  // The runtime draws in place of the container, so the direction goes on the page.
  document.body.dir = options.dir ?? 'ltr'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value: '' } }),
      update: (
        model: typeof Model.Type,
        message: typeof Msg.Type,
      ): Return<typeof Model.Type, typeof Msg.Type> =>
        Msg.match(message, {
          Typed: ({ text }) => ({ model: modifyFields(model, { value: () => text }) }),
          Cleared: () => ({
            model: modifyFields(model, { value: () => '' }),
            commands: [SearchField.Focus({ id: 'find' })],
          }),
          Opened: () => ({ model }),
          CompletedFocus: () => ({ model }),
        }),
      view: (model: typeof Model.Type, h: HtmlBuilder<typeof Msg.Type>) =>
        SearchField.view(
          {
            id: 'find',
            label: 'Search products',
            value: model.value,
            onInput: text => Msg.Typed({ text }),
            onClear: Msg.Cleared(),
            disabled: options.disabled,
            routes: [
              {
                name: 'Open results',
                key: 'ArrowDown',
                toMessage: () => Option.some(Msg.Opened()),
              },
            ],
            style,
          },
          h,
        ),
    }),
  )
}

const input = () => document.querySelector<HTMLInputElement>('#find-input')!
const clear = () => document.querySelector<HTMLButtonElement>('#find-clear')

interface DomNode {
  readonly nodeId: number
  readonly nodeName: string
  readonly attributes?: ReadonlyArray<string>
  readonly children?: ReadonlyArray<DomNode>
  readonly shadowRoots?: ReadonlyArray<DomNode>
  readonly contentDocument?: DomNode
}

const descend = (node: DomNode, found: (node: DomNode) => boolean): DomNode | undefined => {
  if (found(node)) return node
  const inside = [
    ...(node.children ?? []),
    ...(node.shadowRoots ?? []),
    ...(node.contentDocument === undefined ? [] : [node.contentDocument]),
  ]
  for (const child of inside) {
    const hit = descend(child, found)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * The browser's own cancel button lives in the input's user-agent shadow tree,
 * where `getComputedStyle` of its pseudo-element reports nothing real: ask the
 * browser for its box, which `display: none` takes away.
 */
const nativeCancelDrawn = async (): Promise<boolean> => {
  const send = cdp().send as (method: string, params?: object) => Promise<any>
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true })
  const field = descend(
    root,
    node => node.nodeName === 'INPUT' && (node.attributes ?? []).includes('find-input'),
  )
  const button =
    field === undefined
      ? undefined
      : descend(field, node =>
          (node.attributes ?? []).some(value => value.includes('search-cancel-button')),
        )
  expect(button).toBeDefined()
  return send('DOM.getBoxModel', { nodeId: button!.nodeId }).then(
    () => true,
    () => false,
  )
}

const typed = async (text: string) => {
  await vi.waitFor(() => expect(input()).not.toBeNull())
  input().focus()
  await userEvent.keyboard(text)
  await vi.waitFor(() => expect(input().value).toBe(text))
}

test('Escape clears the text and keeps focus in the input', async () => {
  const handle = mount()
  try {
    await typed('lamp')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(input().value).toBe(''))
    expect(document.activeElement).toBe(input())
    expect(clear()).toBeNull()
  } finally {
    handle.dispose()
  }
})

test('Escape on an empty field is not handled, so it reaches a parent', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(input()).not.toBeNull())
    const reached: Array<boolean> = []
    document.body.addEventListener('keydown', event => {
      if (event.key === 'Escape') reached.push(event.defaultPrevented)
    })
    input().focus()
    await userEvent.keyboard('{Escape}')
    expect(reached).toEqual([false])
    await userEvent.keyboard('a')
    await vi.waitFor(() => expect(input().value).toBe('a'))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(input().value).toBe(''))
    // With text the field consumed it.
    expect(reached).toEqual([false, true])
  } finally {
    handle.dispose()
  }
})

test('typing and the caret keys stay native beside the routes', async () => {
  const handle = mount()
  try {
    await typed('lamp')
    await userEvent.keyboard('{ArrowLeft}x')
    await vi.waitFor(() => expect(input().value).toBe('lamxp'))
  } finally {
    handle.dispose()
  }
})

test('pressing the clear button empties the field and puts focus on the input', async () => {
  const handle = mount()
  try {
    await typed('lamp')
    await vi.waitFor(() => expect(clear()).not.toBeNull())
    await userEvent.click(clear()!)
    await vi.waitFor(() => expect(input().value).toBe(''))
    expect(clear()).toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  } finally {
    handle.dispose()
  }
})

test('a disabled field takes no text', async () => {
  const handle = mount({ disabled: true })
  try {
    await vi.waitFor(() => expect(input()).not.toBeNull())
    expect(input().disabled).toBe(true)
    input().focus()
    await userEvent.keyboard('lamp')
    expect(input().value).toBe('')
    expect(document.activeElement).not.toBe(input())
  } finally {
    handle.dispose()
  }
})

test('the browser draws no cancel button of its own, and the input rings on keyboard focus', async () => {
  const handle = mount()
  try {
    await typed('lamp')
    expect(await nativeCancelDrawn()).toBe(false)
    const ring = getComputedStyle(input())
    expect(ring.outlineStyle).not.toBe('none')
    expect(parseFloat(ring.outlineWidth)).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['ltr', undefined],
  ['rtl', 'rtl'],
] as const)('the clear button sits at the inline end in %s', async (direction, dir) => {
  const handle = mount(dir === undefined ? {} : { dir })
  try {
    await typed('lamp')
    const field = input().getBoundingClientRect()
    const button = clear()!.getBoundingClientRect()
    const middle = field.left + field.width / 2
    expect(button.left + button.width / 2 > middle).toBe(direction === 'ltr')
    expect(button.width).toBeGreaterThan(0)
    expect(button.left).toBeGreaterThanOrEqual(field.left)
    expect(button.right).toBeLessThanOrEqual(field.right)
  } finally {
    handle.dispose()
  }
})
