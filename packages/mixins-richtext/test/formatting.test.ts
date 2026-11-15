// @vitest-environment jsdom
/**
 * The formatting toolbar: what each control sends, which are pressed or unavailable for a
 * document and selection, and the one tab stop. Keys and focus are in the browser test.
 */
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { slashEntries as editorSlashEntries } from 'foldkit-richtext-dom/editor'
import { InsertEntry, type FormattingItem } from '../src/index.js'
import {
  Message,
  Toolbar,
  base,
  caret,
  document,
  given,
  range,
  update,
  view,
  wrap,
  type Model,
} from './formatting.js'

const scene = (
  options: Parameters<typeof view>[0],
  model: Model,
  ...steps: ReadonlyArray<Scene.SceneStep<Model, Message, never>>
) => Scene.scene({ update, view: view(options) }, Scene.given(model), ...steps)
const control = (item: string) => Scene.selector(`[data-item="${item}"]`)
const sent = (...values: ReadonlyArray<unknown>) =>
  Scene.expect(Scene.selector('#sent')).toHaveText(values.map(v => JSON.stringify(v)).join('|'))

describe('what each control sends', () => {
  const everything: ReadonlyArray<FormattingItem> = [
    'undo',
    'redo',
    { mark: 'Bold' },
    { mark: 'Code' },
    'quote',
    'bulleted-list',
    'numbered-list',
    'checklist',
  ]

  it.each([
    ['undo', { _tag: 'Undone' }],
    ['redo', { _tag: 'Redone' }],
    ['mark-Bold', { _tag: 'ToggledMark', mark: 'Bold' }],
    ['mark-Code', { _tag: 'ToggledMark', mark: 'Code' }],
    ['quote', { _tag: 'WrappedBlock', containers: [{ kind: 'Quote' }] }],
    [
      'bulleted-list',
      { _tag: 'WrappedBlock', containers: [{ kind: 'List' }, { kind: 'ListItem' }] },
    ],
    [
      'numbered-list',
      {
        _tag: 'WrappedBlock',
        containers: [{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }],
      },
    ],
    [
      'checklist',
      {
        _tag: 'WrappedBlock',
        containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
      },
    ],
  ])('%s sends its editor Message, wrapped', (id, expected) => {
    scene({ items: everything }, given(), Scene.click(`[data-item="${id}"]`), sent(expected))
  })

  it('opens a menu through the caller, and closes the one that is open', () => {
    scene(
      {},
      given(),
      Scene.click('[data-item="style"]'),
      Scene.expect(control('style')).toHaveAttr('aria-expanded', 'true'),
      Scene.click('[data-item="style"]'),
      Scene.expect(control('style')).toHaveAttr('aria-expanded', 'false'),
    )
  })

  it('sends a style and an insert entry, each through wrap', () => {
    scene(
      {},
      given({ menu: 'style' }),
      Scene.click('[data-style="heading-2"]'),
      sent({ _tag: 'RetypedBlock', block: { type: 'Heading', level: 2 } }),
    )
    scene(
      {},
      given({ menu: 'insert' }),
      Scene.click('[data-insert="code-block"]'),
      sent({ _tag: 'ConvertedBlock', to: { kind: 'CodeBlock' } }),
    )
  })
})

describe('what is pressed and what is unavailable', () => {
  const items: ReadonlyArray<FormattingItem> = [{ mark: 'Bold' }, { mark: 'Italic' }, 'link']

  it('presses a mark the caret carries, and lets the stored format win', () => {
    scene(
      { items },
      given({ selection: caret('b') }),
      Scene.expect(control('mark-Bold')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(control('mark-Italic')).toHaveAttr('aria-pressed', 'false'),
    )
    scene(
      { items, storedMarks: ['Italic'] },
      given({ selection: caret('a') }),
      Scene.expect(control('mark-Italic')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(control('mark-Bold')).toHaveAttr('aria-pressed', 'false'),
    )
  })

  it('refuses without a selection: aria-disabled, and focusable rather than natively disabled', () => {
    scene(
      { items: [{ mark: 'Bold' }, 'quote'] },
      given({ selection: null }),
      Scene.expect(control('mark-Bold')).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(control('mark-Bold')).not.toHaveAttr('disabled', ''),
      Scene.expect(control('quote')).toHaveAttr('aria-disabled', 'true'),
    )
  })

  it('draws no menu panel for a trigger that is unavailable', () => {
    scene(
      {},
      given({ selection: null, menu: 'style' }),
      Scene.expectAll(Scene.all.selector('[role="menu"]')).toHaveCount(0),
      Scene.expect(control('style')).toHaveAttr('aria-expanded', 'false'),
    )
  })

  it('offers link only where the selection covers text', () => {
    scene(
      { items },
      given({ selection: caret('a') }),
      Scene.expect(control('link')).toHaveAttr('aria-disabled', 'true'),
    )
    scene(
      { items },
      given({ selection: range('a', 0, 2) }),
      Scene.expect(control('link')).toHaveAttr('aria-disabled', 'false'),
    )
  })

  it('takes undo and redo availability from the caller', () => {
    scene(
      { items: ['undo', 'redo'], history: { undo: false, redo: true } },
      given(),
      Scene.expect(control('undo')).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(control('redo')).toHaveAttr('aria-disabled', 'false'),
    )
  })

  it('shows the current text style on its trigger', () => {
    scene(
      { items: ['style'] },
      given(),
      Scene.expect(control('style')).toHaveAttr('aria-label', 'Text style: Paragraph'),
    )
  })
})

describe('the one tab stop', () => {
  const items: ReadonlyArray<FormattingItem> = ['undo', { mark: 'Bold' }, 'quote']
  const stops = (current: string | null) =>
    Inert.all(
      Toolbar(
        {
          id: 'bar',
          document,
          selection: caret('a'),
          wrap,
          items,
          toggled: (menu, open) => Message.Toggled({ menu, open }),
          roving: { current },
          onFocus: id => Message.Focused({ id }),
        },
        SlotView.inertBuilder(),
      ),
    )
      .filter(node => node.sel === 'button')
      .map(node => node.data?.props?.['tabIndex'])

  it('is the first control until one has had focus', () => {
    expect(stops(null)).toEqual([0, -1, -1])
  })

  it('is the control focused last', () => {
    expect(stops('mark-Bold')).toEqual([-1, 0, -1])
  })

  it('is the first control when the last one is no longer drawn', () => {
    expect(stops('insert')).toEqual([0, -1, -1])
  })
})

describe('what is configurable', () => {
  it('draws the controls it is given, in order, and names them by its words', () => {
    scene(
      { items: ['quote', 'separator', 'undo'], words: { quote: 'Citation', toolbar: 'Edit' } },
      given(),
      Scene.expect(Scene.selector('[role="toolbar"]')).toHaveAttr('aria-label', 'Edit'),
      Scene.expect(control('quote')).toHaveAttr('aria-label', 'Citation'),
      Scene.expect(control('undo')).toHaveAttr('aria-label', 'Undo'),
    )
  })

  it('shows a shortcut the editor binds, and one the application adds', () => {
    scene(
      {
        items: [{ mark: 'Bold' }, { mark: 'Underline' }],
        shortcuts: { 'mark-Underline': 'mod+u' },
      },
      given(),
      Scene.expect(control('mark-Bold')).toHaveAttr('aria-keyshortcuts', 'Control+B'),
      Scene.expect(control('mark-Underline')).toHaveAttr('aria-keyshortcuts', 'Control+U'),
    )
  })
})

const file = InsertEntry.App({
  id: 'file',
  label: 'Image, video or file',
  description: 'Choose from your device',
  message: Message.Picked({ what: 'file' }),
})
const mixed = [
  InsertEntry.Editor({
    entry: editorSlashEntries.find(entry => entry.id === 'code-block')!,
  }),
  file,
]

describe('the insert menu holds the application’s entries beside the editor’s', () => {
  it('lists them in the order given, whichever kind', () => {
    const root = Toolbar(
      {
        ...base,
        items: ['insert'],
        menu: 'insert',
        inserts: [file, ...mixed.slice(0, 1)],
      },
      SlotView.inertBuilder(),
    )
    expect(
      Inert.all(root)
        .filter(node => node.data?.attrs?.['role'] === 'menuitem')
        .map(node => node.data?.attrs?.['data-insert']),
    ).toEqual(['file', 'code-block'])
  })

  it('sends an application entry as it is, and an editor entry through wrap', () => {
    scene(
      { inserts: mixed },
      given({ menu: 'insert' }),
      Scene.click('[data-insert="file"]'),
      Scene.click('[data-insert="code-block"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText(
        `picked:file|${JSON.stringify({ _tag: 'ConvertedBlock', to: { kind: 'CodeBlock' } })}`,
      ),
    )
  })
})

describe('the application’s own controls', () => {
  const find = {
    id: 'find',
    label: 'Find',
    icon: 'search' as const,
    message: Message.Picked({ what: 'find' }),
  }
  const bar = (control: Partial<typeof find> & { disabled?: boolean; pressed?: boolean }) => ({
    items: ['undo', { control: { ...find, ...control } }, { mark: 'Bold' }] satisfies ReadonlyArray<
      FormattingItem<Message>
    >,
  })

  it('sends its Message, and is named by its label', () => {
    scene(
      bar({}),
      given(),
      Scene.expect(control('app-find')).toHaveAttr('aria-label', 'Find'),
      Scene.click('[data-item="app-find"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText('picked:find'),
    )
  })

  it('refuses while disabled: aria-disabled, focusable, no handler', () => {
    const root = Toolbar({ ...base, ...bar({ disabled: true }) }, SlotView.inertBuilder())
    const node = Inert.all(root).find(each => each.data?.attrs?.['data-item'] === 'app-find')
    expect(node?.data?.attrs?.['aria-disabled']).toBe('true')
    expect(node?.data?.attrs?.['disabled']).toBeUndefined()
    expect(node?.data?.on?.['click']).toBeUndefined()
  })

  it('shows its pressed state, and a popup it opens', () => {
    scene(
      {
        items: [
          {
            control: {
              ...find,
              pressed: true,
              popup: { kind: 'menu', open: true },
            },
          },
        ],
      },
      given(),
      Scene.expect(control('app-find')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(control('app-find')).toHaveAttr('aria-haspopup', 'menu'),
      Scene.expect(control('app-find')).toHaveAttr('aria-expanded', 'true'),
    )
  })

  it('shares the one tab stop, in the place items gives it', () => {
    const stops = (current: string | null) =>
      Inert.all(Toolbar({ ...base, ...bar({}), roving: { current } }, SlotView.inertBuilder()))
        .filter(node => node.sel === 'button')
        .map(node => node.data?.props?.['tabIndex'])
    expect(stops(null)).toEqual([0, -1, -1])
    expect(stops('app-find')).toEqual([-1, 0, -1])
  })
})

describe('a compact bar', () => {
  const items: ReadonlyArray<FormattingItem> = [
    'undo',
    'separator',
    { low: { mark: 'Bold' } },
    { low: 'quote' },
    'separator',
    'insert',
  ]
  const drawn = (options: Partial<Parameters<typeof Toolbar>[0]>) =>
    Inert.all(Toolbar({ ...base, items, ...options }, SlotView.inertBuilder()))
  const names = (options: Partial<Parameters<typeof Toolbar>[0]>) =>
    drawn(options)
      .filter(node => node.sel === 'button')
      .map(node => node.data?.attrs?.['data-item'])

  it('draws every control when it is not compact', () => {
    expect(names({})).toEqual(['undo', 'mark-Bold', 'quote', 'insert'])
  })

  it('does not draw the low ones, so they are not a tab stop, and leaves no separator behind', () => {
    expect(names({ compact: true })).toEqual(['undo', 'insert'])
    expect(
      drawn({ compact: true }).filter(node => node.data?.attrs?.['role'] === 'separator'),
    ).toHaveLength(1)
  })

  it('leaves no separator at either end', () => {
    const separators = drawn({
      compact: true,
      items: ['separator', 'undo', 'separator', { low: 'quote' }],
    }).filter(node => node.data?.attrs?.['role'] === 'separator')
    expect(separators).toHaveLength(0)
  })

  it('moves the tab stop to the nearest control that is drawn when the current one goes', () => {
    const stops = (current: string, list: ReadonlyArray<FormattingItem>) =>
      drawn({ compact: true, items: list, roving: { current } })
        .filter(node => node.sel === 'button')
        .map(node => node.data?.props?.['tabIndex'])
    // After it first: Bold goes, and quote after it goes too, so insert holds the stop.
    expect(stops('mark-Bold', items)).toEqual([-1, 0])
    // Nothing drawn after it: the one before.
    expect(stops('quote', ['undo', { mark: 'Bold' }, { low: 'quote' }])).toEqual([-1, 0])
    // A control the list never had: the first.
    expect(stops('gone', items)).toEqual([0, -1])
  })
})
