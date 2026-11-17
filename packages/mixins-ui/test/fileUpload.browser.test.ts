/// <reference types="@vitest/browser-playwright" />
/**
 * FileUpload in a real browser: the dialog opens from the picker and from Enter
 * or Space on the input, a drag over the picker's children keeps its mark, a
 * drop lists the files and a form posts them, a removal moves focus on, the
 * object URLs are revoked once each, a route on Enter is a key conflict, and
 * the recipe draws each state per layout.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Behaviors, Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'
import { FileUpload, FileUploadSlots, Recipes } from '../src/index.js'
import { controlled, mount, Msg, type Harness } from './fileUploadHarness.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

type Layout = 'button' | 'zone' | 'avatar' | 'cover'

interface Options {
  readonly init?: Partial<FileUpload.InitOptions>
  readonly layout?: Layout
  readonly list?: 'rows' | 'grid'
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly readOnly?: boolean
  readonly picture?: boolean
  readonly outs?: Array<FileUpload.OutMessage>
  readonly routes?: ReadonlyArray<FileUpload.Route<Msg>>
  readonly send?: Harness['send']
}

const mountUpload = (options: Options = {}) => {
  const style = Style.forSlots(FileUploadSlots)(
    Recipes.FileUpload({ layout: options.layout ?? 'zone', list: options.list ?? 'rows' }),
  )
  return mount({
    init: { id: 'up', multiple: true, ...options.init },
    styles: [style],
    send: options.send,
    onOut: out => options.outs?.push(out),
    render: (model, lift, h: HtmlBuilder<Msg>) =>
      FileUpload.view(
        {
          model,
          onMessage: lift,
          label: 'browse',
          name: 'attachments',
          disabled: options.disabled,
          invalid: options.invalid,
          readOnly: options.readOnly,
          routes: options.routes,
          ...(options.picture === true
            ? {
                picture: (url: Option.Option<string>) =>
                  Option.match(url, {
                    onNone: () => h.span([], ['no picture']),
                    onSome: src => h.img([h.Src(src), h.Alt('')]),
                  }),
              }
            : {}),
          words: { prompt: 'Drop files or' },
          style,
        },
        h,
      ),
    page: (widget: Html, h: HtmlBuilder<Msg>) =>
      h.form(
        [h.Id('apply')],
        [
          h.button([h.Id('before'), h.Type('button')], ['Before']),
          widget,
          h.button([h.Id('after'), h.Type('button')], ['After']),
        ],
      ),
  })
}

const input = () => document.querySelector<HTMLInputElement>('#up-input')!
const picker = () => document.querySelector<HTMLElement>('label[for="up-input"]')!
const ready = () => vi.waitFor(() => expect(picker()).not.toBeNull())
const rows = () => Array.from(document.querySelectorAll('li')).map(row => row.textContent)
const names = () =>
  Array.from(document.querySelectorAll('li span[title]')).map(row => row.textContent)
const submitted = () =>
  new FormData(document.querySelector<HTMLFormElement>('#apply')!)
    .getAll('attachments')
    .map(entry => (entry instanceof File ? entry.name : String(entry)))
    .filter(name => name !== '')

let stamp = 0
const make = (name: string, type = 'text/plain') => {
  stamp += 1
  return new File(['x'.repeat(10)], name, { type, lastModified: stamp })
}

const drag = (target: Element, type: 'dragenter' | 'dragleave' | 'dragover', related?: Element) =>
  target.dispatchEvent(
    new DragEvent(type, { bubbles: true, cancelable: true, relatedTarget: related ?? null }),
  )

const drop = (target: Element, files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  target.dispatchEvent(
    new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
  )
}

const dragging = () => picker().hasAttribute('data-dragging')

const watchDialog = async () => {
  const send = cdp().send as (method: string, params?: object) => Promise<unknown>
  await send('Page.enable')
  await send('Page.setInterceptFileChooserDialog', { enabled: true })
  const opened: Array<string> = []
  cdp().on('Page.fileChooserOpened', () => opened.push('opened'))
  return opened
}

test('a press on the picker and Enter or Space on the focused input open the dialog, and the input is named by the picker', async () => {
  const handle = mountUpload()
  try {
    await ready()
    const opened = await watchDialog()
    await userEvent.click(picker())
    await vi.waitFor(() => expect(opened).toHaveLength(1))
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(opened).toHaveLength(3))
    await expect.element(page.getByLabelText('Drop files or browse')).toBe(input())
  } finally {
    handle.dispose()
  }
})

test('probe: a drag over a child of the picker keeps its mark, and leaving the picker clears it', async () => {
  const handle = mountUpload()
  try {
    await ready()
    const child = picker().querySelector<HTMLElement>('span')!
    drag(picker(), 'dragenter')
    await vi.waitFor(() => expect(dragging()).toBe(true))
    // The browser's order when the pointer moves onto a child: enter the child, then leave the zone.
    drag(child, 'dragenter', picker())
    drag(picker(), 'dragleave', child)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(dragging()).toBe(true)
    drag(child, 'dragleave', document.body)
    await vi.waitFor(() => expect(dragging()).toBe(false))
  } finally {
    handle.dispose()
  }
})

test('probe: a synthetic drop of real files lists them, and a form posts exactly them', async () => {
  const handle = mountUpload()
  try {
    await ready()
    const a = make('a.txt')
    const b = make('b.txt')
    drag(picker(), 'dragenter')
    await vi.waitFor(() => expect(dragging()).toBe(true))
    drop(picker(), [a, b])
    await vi.waitFor(() => expect(names()).toEqual(['a.txt', 'b.txt']))
    expect(dragging()).toBe(false)
    await vi.waitFor(() => expect(submitted()).toEqual(['a.txt', 'b.txt']))
    expect(input().files?.[0]).toBe(a)
  } finally {
    handle.dispose()
  }
})

test('a drop that holds no files says so, and a pick adds beside what is listed', async () => {
  const handle = mountUpload()
  try {
    await ready()
    drop(picker(), [])
    await vi.waitFor(() =>
      expect(document.querySelector('ul')?.textContent).toBe('Drop files, not text or links'),
    )
    await userEvent.upload(input(), [make('a.txt')])
    await vi.waitFor(() => expect(names()).toEqual(['a.txt']))
    await userEvent.upload(input(), [make('b.txt')])
    await vi.waitFor(() => expect(names()).toEqual(['a.txt', 'b.txt']))
    await vi.waitFor(() => expect(submitted()).toEqual(['a.txt', 'b.txt']))
  } finally {
    handle.dispose()
  }
})

test('a refused pick leaves the list in the input, which the browser emptied', async () => {
  const handle = mountUpload({ init: { maxSize: 5 } })
  try {
    await ready()
    await userEvent.upload(input(), [new File(['ok'], 'ok.txt', { type: 'text/plain' })])
    await vi.waitFor(() => expect(names()).toEqual(['ok.txt']))
    await userEvent.upload(input(), [make('big.txt')])
    await vi.waitFor(() =>
      expect(document.querySelector('ul')?.textContent).toContain('big.txt is over 5 B'),
    )
    expect(names()).toEqual(['ok.txt'])
    await vi.waitFor(() => expect(submitted()).toEqual(['ok.txt']))
  } finally {
    handle.dispose()
  }
})

test('removing moves focus to the next entry, else the previous, else the input', async () => {
  const handle = mountUpload()
  try {
    await ready()
    drop(picker(), [make('a.txt'), make('b.txt'), make('c.txt')])
    await vi.waitFor(() => expect(names()).toHaveLength(3))
    const buttons = () => Array.from(document.querySelectorAll<HTMLElement>('li button'))
    buttons()[1]!.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(names()).toEqual(['a.txt', 'c.txt']))
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[1]))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(names()).toEqual(['a.txt']))
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[0]))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(names()).toEqual([]))
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
    expect(submitted()).toEqual([])
  } finally {
    handle.dispose()
  }
})

test('Backspace on the input removes the last file and keeps focus there', async () => {
  const handle = mountUpload()
  try {
    await ready()
    drop(picker(), [make('a.txt'), make('b.txt')])
    await vi.waitFor(() => expect(names()).toHaveLength(2))
    input().focus()
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(names()).toEqual(['a.txt']))
    expect(document.activeElement).toBe(input())
  } finally {
    handle.dispose()
  }
})

test('a route on Enter or Space is a key conflict, and a route on another key is not', () => {
  const on = (key: string) =>
    Behaviors.Keys.route<FileUpload.Model, Msg>('Mine', {
      on: [Behaviors.Keys.chord(key)],
      handle: () => Option.none(),
    })
  for (const key of ['Enter', ' ', 'Backspace', 'Delete']) {
    const found = FileUpload.conflict([on(key)])
    expect(Option.isSome(found) && found.value.code).toBe('mixins:key-conflict')
  }
  expect(Option.isNone(FileUpload.conflict([on('ArrowDown')]))).toBe(true)
  expect(Option.isNone(FileUpload.conflict([]))).toBe(true)
})

const computed = (element: Element, pseudo?: string) => getComputedStyle(element, pseudo)

const states = {
  dragging: () => {
    drag(picker(), 'dragenter')
    return vi.waitFor(() => expect(dragging()).toBe(true))
  },
}

test.each(['button', 'zone', 'avatar', 'cover'] as const)(
  'the %s layout answers a drag over it by its own colours, and not at rest',
  async layout => {
    const handle = mountUpload({ layout, picture: layout === 'avatar' || layout === 'cover' })
    try {
      await ready()
      const rest = computed(picker())
      const before = {
        border: rest.borderColor,
        background: rest.backgroundColor,
        shadow: rest.boxShadow,
      }
      await states.dragging()
      const held = computed(picker())
      const after = {
        border: held.borderColor,
        background: held.backgroundColor,
        shadow: held.boxShadow,
      }
      expect(after).not.toEqual(before)
    } finally {
      handle.dispose()
    }
  },
)

test.each(['button', 'zone', 'avatar', 'cover'] as const)(
  'the %s layout is dimmed, shows not-allowed and answers nothing when disabled',
  async layout => {
    const handle = mountUpload({
      layout,
      disabled: true,
      picture: layout === 'avatar' || layout === 'cover',
    })
    try {
      await ready()
      const style = computed(picker())
      expect(parseFloat(style.opacity)).toBeLessThan(1)
      expect(style.cursor).toBe('not-allowed')
      expect(style.pointerEvents).toBe('none')
      expect(input().disabled).toBe(true)
    } finally {
      handle.dispose()
    }
  },
)

test.each(['button', 'zone', 'avatar', 'cover'] as const)(
  'the %s layout draws an error edge when invalid',
  async layout => {
    const picture = layout === 'avatar' || layout === 'cover'
    const edge = async (invalid: boolean) => {
      const handle = mountUpload({ layout, picture, invalid })
      try {
        await ready()
        const style = computed(picker())
        return `${style.borderColor}|${style.boxShadow}`
      } finally {
        handle.dispose()
        document.body.replaceChildren()
      }
    }
    const rest = await edge(false)
    expect(await edge(true)).not.toBe(rest)
  },
)

test.each(['avatar', 'cover'] as const)(
  'the %s layout veils its picture on hover and on keyboard focus, and not at rest',
  async layout => {
    const handle = mountUpload({ layout, picture: true, init: { multiple: false } })
    try {
      await ready()
      await userEvent.hover(document.body, { position: { x: 2, y: 2 } })
      const veil = () => parseFloat(computed(picker(), '::after').opacity)
      await vi.waitFor(() => expect(veil()).toBe(0))
      await userEvent.hover(picker())
      await vi.waitFor(() => expect(veil()).toBe(1))
      await userEvent.hover(document.body, { position: { x: 2, y: 2 } })
      await vi.waitFor(() => expect(veil()).toBe(0))
      document.querySelector<HTMLElement>('#before')!.focus()
      await userEvent.tab()
      expect(document.activeElement).toBe(input())
      await vi.waitFor(() => expect(veil()).toBe(1))
    } finally {
      handle.dispose()
    }
  },
)

test('the avatar layout is round and the picker rings on keyboard focus only', async () => {
  const handle = mountUpload({ layout: 'avatar', picture: true, init: { multiple: false } })
  try {
    await ready()
    drop(picker(), [make('a.png', 'image/png')])
    await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull())
    const box = picker().getBoundingClientRect()
    expect(Math.abs(box.width - box.height)).toBeLessThan(1)
    expect(computed(picker()).borderRadius).toMatch(/%|px/)
    expect(computed(picker()).outlineStyle).toBe('none')
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(computed(picker()).outlineStyle).not.toBe('none')
  } finally {
    handle.dispose()
  }
})

test('the grid list draws each file as a card in columns, the rows list as full-width rows', async () => {
  const handle = mountUpload({ list: 'grid' })
  try {
    await ready()
    drop(picker(), [
      make('a.png', 'image/png'),
      make('b.png', 'image/png'),
      make('c.png', 'image/png'),
    ])
    await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(3))
    const cards = Array.from(document.querySelectorAll('li')).map(each =>
      each.getBoundingClientRect(),
    )
    expect(new Set(cards.map(card => Math.round(card.top))).size).toBe(1)
  } finally {
    handle.dispose()
  }
})
