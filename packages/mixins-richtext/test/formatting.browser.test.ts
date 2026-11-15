/// <reference types="@vitest/browser-playwright" />
/**
 * The formatting toolbar beside a real editor, in a real browser: one tab stop that returns to the
 * control used last, arrows, Home and End moving real focus, Bold toggling the selection's mark with
 * the selection kept, an unavailable control that is focusable and refuses, a menu entered and left
 * by key, and a bar that fits a phone's width.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { EditorView, editorView } from 'foldkit-richtext-dom/editor-bundle'
import { EditorInput, richTextInput } from 'foldkit-richtext-dom/input'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { formattingToolbar, type FormattingItem } from '../src/index.js'

const hostId = 'fmt-body'
const control = richTextInput(hostId)
const initial = EditorInput.init({ hostId }).model

const App = defineMessageUnion({
  GotEditor: { message: EditorMessage },
  Toggled: { menu: Schema.Literals(['style', 'insert', 'link']), open: Schema.Boolean },
  Focused: { id: Schema.String },
})
type App = typeof App.Type

const Model = Schema.Struct({
  editor: EditorView,
  menu: Schema.UndefinedOr(Schema.Literals(['style', 'insert', 'link'])),
  current: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type

const Toolbar = formattingToolbar<App>()

const hello = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'hello', marks: [] }],
    },
  ],
})

const update = (model: Model, message: App): Update.Return<Model, App> =>
  App.match(message, {
    GotEditor: ({ message: editorMessage }) => {
      const next = EditorInput.update(model.editor, editorMessage, { hostId })
      return {
        model: { ...model, editor: next.model },
        commands: (next.commands ?? []).map(command => ({
          ...command,
          effect: Effect.map(command.effect, inner => App.GotEditor({ message: inner })),
        })),
      }
    },
    Toggled: ({ menu, open }) => ({ model: { ...model, menu: open ? menu : undefined } }),
    Focused: ({ id }) => ({ model: { ...model, current: id } }),
  })

const items: ReadonlyArray<FormattingItem> = [
  'undo',
  { mark: 'Bold' },
  { mark: 'Italic' },
  'style',
  'quote',
]

interface Options {
  readonly items?: ReadonlyArray<FormattingItem>
  readonly history?: { readonly undo: boolean; readonly redo: boolean }
}

const view = (options: Options) => (model: Model, h: HtmlBuilder<App>) =>
  h.div(
    [h.Id('page')],
    [
      h.input([h.Id('before'), h.Type('text')]),
      Toolbar(
        {
          id: 'bar',
          document: model.editor.document,
          selection: model.editor.selection,
          storedMarks: model.editor.storedMarks,
          wrap: message => App.GotEditor({ message }),
          items: options.items ?? items,
          history: options.history,
          menu: model.menu,
          toggled: (menu, open) => App.Toggled({ menu, open }),
          roving: { current: model.current },
          onFocus: id => App.Focused({ id }),
        },
        h,
      ),
      h.input([h.Id('after'), h.Type('text')]),
      h.submodel({
        slotId: 'editor',
        model: model.editor,
        view: editorView,
        toParentMessage: message => App.GotEditor({ message }),
      }),
      // The Model's document and selection, which is what a command reads.
      h.pre(
        [h.Id('runs')],
        [
          JSON.stringify(
            model.editor.document.children.flatMap(block =>
              block.type === 'Paragraph' ? block.children.map(run => [run.text, run.marks]) : [],
            ),
          ),
        ],
      ),
      h.pre([h.Id('selection')], [JSON.stringify(model.editor.selection)]),
    ],
  )

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (options: Options = {}) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  // What an application's own style must give: a bar that may wrap.
  sheet.textContent = `[role="toolbar"] { display: flex; flex-wrap: wrap; gap: 4px; }`
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'fmt-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { editor: control.data.fill(initial, hello), menu: undefined, current: null },
      }),
      update,
      view: view(options),
    }),
  )
}

const active = () =>
  document.activeElement?.getAttribute('data-item') ?? document.activeElement?.id ?? ''
const runs = () => document.querySelector('#runs')?.textContent
const selection = () => document.querySelector('#selection')?.textContent
const ready = () =>
  vi.waitFor(() => expect(document.querySelector('[role="toolbar"] button')).not.toBeNull())
const item = (name: string) => document.querySelector<HTMLElement>(`[data-item="${name}"]`)!

/** Selects the word in the editor the way a user does, so the editor reports its own selection. */
const selectWord = async () => {
  await vi.waitFor(() => expect(document.querySelector('[contenteditable] p')).not.toBeNull())
  const walker = document.createTreeWalker(
    document.querySelector('[contenteditable] p')!,
    NodeFilter.SHOW_TEXT,
  )
  const text = walker.nextNode()!
  document.querySelector<HTMLElement>('[contenteditable]')!.focus()
  window.getSelection()!.setBaseAndExtent(text, 0, text, text.textContent?.length ?? 0)
  await vi.waitFor(() => expect(selection()).not.toBe('null'))
}

test('Tab enters at the first control and leaves in one more, then returns to the one used last', async () => {
  const handle = mount()
  try {
    await ready()
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(active()).toBe('undo')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(active()).toBe('mark-Italic')
    await userEvent.tab()
    expect(active()).toBe('after')
    await userEvent.tab({ shift: true })
    expect(active()).toBe('mark-Italic')
  } finally {
    await handle.dispose()
  }
})

test('the arrows, Home and End move focus and wrap, and an unavailable control is reached', async () => {
  const handle = mount({ history: { undo: false, redo: false } })
  try {
    await ready()
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    // Undo is unavailable and still takes the stop.
    expect(active()).toBe('undo')
    expect(item('undo').getAttribute('aria-disabled')).toBe('true')
    await userEvent.keyboard('{End}')
    expect(active()).toBe('quote')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('undo')
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('quote')
    await userEvent.keyboard('{Home}')
    expect(active()).toBe('undo')
  } finally {
    await handle.dispose()
  }
})

test('a press on an unavailable control changes nothing', async () => {
  // The editor has an edit to undo; the application says undo is not available.
  const handle = mount({ history: { undo: false, redo: false } })
  try {
    await ready()
    await selectWord()
    await userEvent.click(item('mark-Bold'))
    await vi.waitFor(() => expect(runs()).toBe('[["hello",["Bold"]]]'))
    // Playwright will not press an aria-disabled element; a script's click is what reaches it.
    item('undo').click()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(runs()).toBe('[["hello",["Bold"]]]')
  } finally {
    await handle.dispose()
  }
})

test('Bold toggles the mark on the selected word and the editor keeps its selection', async () => {
  const handle = mount()
  try {
    await ready()
    await selectWord()
    const selected = selection()
    expect(item('mark-Bold').getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(item('mark-Bold'))
    await vi.waitFor(() => expect(item('mark-Bold').getAttribute('aria-pressed')).toBe('true'))
    expect(runs()).toBe('[["hello",["Bold"]]]')
    expect(selection()).toBe(selected)
  } finally {
    await handle.dispose()
  }
})

test('the style menu opens with Down, is entered with a second Down, and Escape returns to its trigger', async () => {
  const handle = mount()
  try {
    await ready()
    await selectWord()
    item('style').focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(item('style').getAttribute('aria-expanded')).toBe('true'))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio')
    const first = document.activeElement?.id
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.id).not.toBe(first)
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(item('style').getAttribute('aria-expanded')).toBe('false'))
    expect(active()).toBe('style')
  } finally {
    await handle.dispose()
  }
})

test('a bar of every standard control fits a phone without a sideways scroll', async () => {
  await page.viewport(390, 800)
  const handle = mount({
    items: [
      'undo',
      'redo',
      'separator',
      'style',
      'separator',
      { mark: 'Bold' },
      { mark: 'Italic' },
      { mark: 'Code' },
      'link',
      'separator',
      'bulleted-list',
      'numbered-list',
      'checklist',
      'quote',
      'separator',
      'insert',
    ],
  })
  try {
    await ready()
    const root = document.documentElement
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
    const bar = document.querySelector('[role="toolbar"]')!.getBoundingClientRect()
    expect(bar.right).toBeLessThanOrEqual(root.clientWidth)
  } finally {
    await handle.dispose()
    await page.viewport(1440, 900)
  }
})
