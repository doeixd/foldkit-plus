/// <reference types="@vitest/browser-playwright" />
/**
 * The ten reference examples of FileUpload, each drawn with the public API and
 * held to what defines it, in a real browser: 1 Basic, 2 Avatar, 3 Drag and
 * drop, 4 Gallery, 5 Progress, 6 Table, 7 Image upload, 8 Sorting, 9 Card,
 * 10 Cover. Also the lanes (a removed entry interrupts its own stream only),
 * the object URLs (each revoked once) and a reorder's focus.
 */
import { Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Layers, Style, type NamedStyle } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { Reorder } from 'foldkit-primitives/interaction'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Avatar,
  AvatarSlots,
  Card,
  CardSlots,
  FileUpload,
  FileUploadProgress,
  FileUploadSlots,
  FileUploadSort,
  ProgressSlots,
  Recipes,
  Table,
  TableSlots,
} from '../src/index.js'
import { controlled, mount, Msg, theme, type Harness } from './fileUploadHarness.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

let stamp = 0
const make = (name: string, type = 'text/plain', size = 10) => {
  stamp += 1
  return new File(['x'.repeat(size)], name, { type, lastModified: stamp })
}
const png = (name: string, size = 10) => make(name, 'image/png', size)

const drop = (target: Element, files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  target.dispatchEvent(
    new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
  )
}

const picker = () => document.querySelector<HTMLElement>('label[for="up-input"]')!
const input = () => document.querySelector<HTMLInputElement>('#up-input')!
const ready = () => vi.waitFor(() => expect(picker()).not.toBeNull())
const names = () =>
  Array.from(document.querySelectorAll('[title]')).map(element => element.textContent)
const errors = () =>
  Array.from(document.querySelectorAll('#up-errors li')).map(item => item.textContent)
const status = () => document.querySelector('[role="status"]')?.textContent
const progressBars = () => Array.from(document.querySelectorAll('[role="progressbar"]'))
const button = (label: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!

const fileStyle = (
  layout: 'button' | 'zone' | 'avatar' | 'cover',
  list: 'rows' | 'grid' = 'rows',
) => Style.forSlots(FileUploadSlots)(Recipes.FileUpload({ layout, list }))
const bar = Style.forSlots(ProgressSlots)(Recipes.Progress({}))
const ring = Style.forSlots(ProgressSlots)(Recipes.Progress({ shape: 'ring' }))

type Draw = Harness['render']

const view =
  (
    options: Partial<FileUpload.FileUploadView<Msg>>,
    wrap?: (widget: Html, h: HtmlBuilder<Msg>) => Html,
  ): Draw =>
  (model, lift, h) => {
    const widget = FileUpload.view({ model, onMessage: lift, label: 'browse', ...options }, h)
    return wrap === undefined ? widget : wrap(widget, h)
  }

const run = (
  init: Partial<FileUpload.InitOptions>,
  styles: ReadonlyArray<NamedStyle<any>>,
  render: Draw,
  extra: Partial<Harness> = {},
) => mount({ init: { id: 'up', ...init }, styles, render, ...extra })

// 1. Basic: a single image, the button layout.
test('1 Basic: one image replaces the last, and another kind is refused beside it', async () => {
  const style = fileStyle('button')
  const handle = run(
    { accept: ['image/*'] },
    [style],
    view({ label: 'Choose an image', style, description: 'Images only.' }),
  )
  try {
    await ready()
    await userEvent.upload(input(), [png('a.png')])
    await vi.waitFor(() => expect(names()).toEqual(['a.png']))
    await userEvent.upload(input(), [png('b.png')])
    await vi.waitFor(() => expect(names()).toEqual(['b.png']))
    await userEvent.upload(input(), [make('c.txt')])
    await vi.waitFor(() => expect(errors()).toContain('c.txt is not an accepted type'))
    expect(names()).toEqual(['b.png'])
    expect(input().accept).toBe('image/*')
  } finally {
    handle.dispose()
  }
})

// 2. Avatar: the picture is an Avatar over the picker; too big a file is refused.
test('2 Avatar: the picture follows the file, a file over 2 MB is refused and the picture stays', async () => {
  const style = fileStyle('avatar')
  const avatar = Style.forSlots(AvatarSlots)(Recipes.Avatar({ size: 'xl' }))
  const handle = run(
    { maxSize: 2_000_000, accept: ['image/*'] },
    [style, avatar],
    (model, lift, h) =>
      FileUpload.view(
        {
          model,
          onMessage: lift,
          label: 'Change photo',
          style,
          picture: url =>
            Avatar.view(
              {
                name: 'Ada Lovelace',
                ...Option.match(url, { onNone: () => ({}), onSome: src => ({ src }) }),
                style: avatar,
              },
              h,
            ),
        },
        h,
      ),
  )
  try {
    await ready()
    expect(document.querySelector('img')).toBeNull()
    drop(picker(), [new File([new Uint8Array(200)], 'me.png', { type: 'image/png' })])
    await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull())
    const shown = document.querySelector('img')?.getAttribute('src')
    expect(shown).toMatch(/^blob:/)
    drop(picker(), [png('big.png', 2_000_001)])
    await vi.waitFor(() => expect(errors().join()).toContain('big.png is over 2.0 MB'))
    expect(document.querySelector('img')?.getAttribute('src')).toBe(shown)
    expect(document.querySelector('[data-status]')).toBeNull()
  } finally {
    handle.dispose()
  }
})

// 3. Drag and drop: the zone, the limits and the refusals.
test('3 Drag and drop: a sixth file is refused whole, an oversized one by name, and the limits are written', async () => {
  const style = fileStyle('zone')
  const handle = run(
    { multiple: true, maxFiles: 5, maxSize: 100 },
    [style],
    view({ style, words: { prompt: 'Drop files here or' } }),
  )
  try {
    await ready()
    expect(document.body.textContent).toContain('Up to 5 files, 100 B each')
    expect(picker().textContent).toBe('Drop files here or browse')
    drop(picker(), [make('a'), make('b'), make('c'), make('d')])
    await vi.waitFor(() => expect(names()).toHaveLength(4))
    drop(picker(), [make('e'), make('f')])
    await vi.waitFor(() => expect(errors()).toContain('No more than 5 files'))
    expect(names()).toHaveLength(4)
    drop(picker(), [make('big', 'text/plain', 500)])
    await vi.waitFor(() => expect(errors()).toEqual(['big is over 100 B']))
  } finally {
    handle.dispose()
  }
})

// 4. Gallery: grid, a summary with the total size, Clear all, and an action per image.
test('4 Gallery: the grid shows thumbnails, the summary totals the size, an action opens, Clear all empties and focuses the input', async () => {
  const style = fileStyle('zone', 'grid')
  const open = (entry: FileUpload.Entry, h: HtmlBuilder<Msg>) =>
    h.a(
      [h.Href(Option.getOrElse(FileUpload.displayUrl(entry), () => '#')), h.Id(`open-${entry.id}`)],
      [`Open ${entry.name}`],
    )
  const gallery = run({ multiple: true, accept: ['image/*'] }, [style], (model, lift, h) =>
    FileUpload.view(
      { model, onMessage: lift, label: 'browse', style, itemActions: entry => [open(entry, h)] },
      h,
    ),
  )
  try {
    await ready()
    drop(picker(), [png('a.png', 100), png('b.png', 200)])
    await vi.waitFor(() => expect(document.querySelectorAll('li img')).toHaveLength(2))
    expect(document.body.textContent).toContain('2 files, 300 B')
    expect(document.querySelector<HTMLAnchorElement>('#open-local-1')?.href).toMatch(/^blob:/)
    const cards = Array.from(document.querySelectorAll('li')).map(each =>
      Math.round(each.getBoundingClientRect().top),
    )
    expect(new Set(cards).size).toBe(1)
    await userEvent.click(document.querySelector<HTMLElement>('button:not([aria-label])')!)
    await vi.waitFor(() => expect(names()).toEqual([]))
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  } finally {
    gallery.dispose()
  }
})

test('4 Gallery: in a parent that centres its children the grid has room for tiles side by side', async () => {
  const style = fileStyle('zone', 'grid')
  const gallery = run({ multiple: true, accept: ['image/*'] }, [style], (model, lift, h) =>
    h.div(
      [h.Style({ display: 'flex', justifyContent: 'center', inlineSize: '480px' })],
      [FileUpload.view({ model, onMessage: lift, label: 'browse', style }, h)],
    ),
  )
  try {
    await ready()
    drop(picker(), [png('a.png', 100), png('b.png', 200), png('c.png', 300)])
    await vi.waitFor(() => expect(document.querySelectorAll('li img')).toHaveLength(3))
    const tops = Array.from(document.querySelectorAll('li')).map(each =>
      Math.round(each.getBoundingClientRect().top),
    )
    expect(new Set(tops).size).toBe(1)
  } finally {
    gallery.dispose()
  }
})

// 5. Progress: three lanes, bars, a failure that is retried, counts.
test('5 Progress: three at a time with a bar each, the fourth waits, a failure is retried and the counts follow', async () => {
  const style = fileStyle('zone')
  const sends = controlled()
  const progress = FileUploadProgress.make({ style: bar })
  const handle = run({ multiple: true, lanes: 3 }, [style, bar], view({ style, progress }), {
    send: sends.send,
  })
  try {
    await ready()
    drop(picker(), [make('a'), make('b'), make('c'), make('d')])
    await vi.waitFor(() => expect(sends.started).toHaveLength(3))
    await vi.waitFor(() => expect(progressBars()).toHaveLength(3))
    // The bar is named by its label, which is out of sight and still in the accessibility tree.
    const labelId = progressBars()[0]!.getAttribute('aria-labelledby')!
    const label = document.getElementById(labelId)!
    expect(label.textContent).toMatch(/^Uploading /)
    expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1)
    const [first, second] = sends.started
    sends.progress(first!, 5, 10)
    await vi.waitFor(() =>
      expect(progressBars().map(each => each.getAttribute('aria-valuenow'))).toContain('5'),
    )
    sends.fail(second!)
    await vi.waitFor(() => expect(sends.started).toHaveLength(4))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Failed: offline'))
    await userEvent.click(button('Try b again'))
    await vi.waitFor(() => expect(document.querySelector('[data-status="queued"]')).not.toBeNull())
    sends.succeed(first!)
    await vi.waitFor(() => expect(sends.started).toHaveLength(5))
    expect(sends.started[4]?.attempt).toBe(2)
    await vi.waitFor(() => expect(status()).toBe('a uploaded'))
  } finally {
    handle.dispose()
  }
})

// Lanes: removing an uploading entry interrupts that stream only.
test('lanes: removing an uploading file ends its own request and no other', async () => {
  const style = fileStyle('zone')
  const sends = controlled()
  const handle = run({ multiple: true, lanes: 2 }, [style], view({ style }), { send: sends.send })
  try {
    await ready()
    drop(picker(), [make('a'), make('b'), make('c')])
    await vi.waitFor(() => expect(sends.started).toHaveLength(2))
    await vi.waitFor(() => expect(button('Cancel a')).not.toBeNull())
    await userEvent.click(button('Cancel a'))
    await vi.waitFor(() => expect(sends.ended).toEqual(['local-1']))
    await vi.waitFor(() =>
      expect(sends.started.map(job => job.id)).toEqual(['local-1', 'local-2', 'local-3']),
    )
    expect(sends.ended).toEqual(['local-1'])
    expect(names()).toEqual(['b', 'c'])
  } finally {
    handle.dispose()
  }
})

// 6. Table: the parts laid into Table.view, a ring per uploading row.
test('6 Table: a row per file with its status and a ring while it uploads', async () => {
  const style = fileStyle('zone')
  const table = Style.forSlots(TableSlots)(Recipes.Table({}))
  const sends = controlled()
  const progress = FileUploadProgress.make({ style: ring })
  const handle = run(
    { multiple: true, lanes: 2 },
    [style, table, ring],
    (model, lift, h) => {
      const drawn = FileUpload.parts(
        { model, onMessage: lift, label: 'browse', style, progress },
        h,
      )
      return drawn.root([
        drawn.input,
        ...Option.toArray(drawn.picker),
        drawn.status,
        Table.view(
          {
            caption: 'Files',
            style: table,
            rows: drawn.items,
            rowKey: row => row.entry.id,
            columns: [
              { header: 'Name', rowHeader: true, value: row => row.name },
              { header: 'Type', value: row => row.entry.type },
              { header: 'Size', numeric: true, value: row => row.meta },
              {
                header: 'Status',
                value: row =>
                  Option.getOrElse(row.progress, () =>
                    Option.getOrElse(row.state, () => h.span([], [])),
                  ),
              },
              {
                header: 'Actions',
                value: row => Option.getOrElse(row.actions, () => h.span([], [])),
              },
            ],
          },
          h,
        ),
      ])
    },
    { send: sends.send },
  )
  try {
    await ready()
    drop(picker(), [make('a'), make('b'), make('c')])
    await vi.waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(3))
    expect(Array.from(document.querySelectorAll('th')).map(each => each.textContent)).toContain(
      'Name',
    )
    await vi.waitFor(() => expect(progressBars()).toHaveLength(2))
    expect(document.querySelector('tbody')?.textContent).toContain('Waiting')
    expect(button('Cancel a')).not.toBeNull()
    expect(document.querySelector('ul')).toBeNull()
  } finally {
    handle.dispose()
  }
})

// 7. Image upload: zone and grid, a bar per new image, two lanes.
test('7 Image upload: thumbnails in a grid, a bar on the two that are sending and the third waits', async () => {
  const style = fileStyle('zone', 'grid')
  const sends = controlled()
  const handle = run(
    { multiple: true, accept: ['image/*'], lanes: 2 },
    [style, bar],
    view({ style, progress: FileUploadProgress.make({ style: bar }) }),
    { send: sends.send },
  )
  try {
    await ready()
    drop(picker(), [png('a.png'), png('b.png'), png('c.png')])
    await vi.waitFor(() => expect(document.querySelectorAll('li img')).toHaveLength(3))
    await vi.waitFor(() => expect(progressBars()).toHaveLength(2))
    sends.succeed(sends.started[0]!, Option.some('/a.png'))
    await vi.waitFor(() => expect(progressBars()).toHaveLength(2))
    await vi.waitFor(() => expect(sends.started).toHaveLength(3))
  } finally {
    handle.dispose()
  }
})

// 9. Card: the field inside a Card.
test("9 Card: the field is a Card's content, its footer beside it", async () => {
  const style = fileStyle('zone')
  const card = Style.forSlots(CardSlots)(Recipes.Card({}))
  const handle = run({ multiple: true }, [style, card], (model, lift, h) =>
    Card.view(
      {
        title: 'Attachments',
        description: 'Add what supports your request.',
        content: FileUpload.view({ model, onMessage: lift, label: 'browse', style }, h),
        footer: h.span([h.Id('card-footer')], ['Saved automatically']),
        style: card,
      },
      h,
    ),
  )
  try {
    await ready()
    drop(picker(), [make('a'), make('b')])
    await vi.waitFor(() => expect(names()).toEqual(['a', 'b']))
    const cardBox = document.querySelector('#card-footer')!.parentElement!.parentElement!
    expect(cardBox.contains(picker())).toBe(true)
    expect(cardBox.querySelector('h3')?.textContent).toBe('Attachments')
  } finally {
    handle.dispose()
  }
})

// 10. Cover: a wide frame, a ring while one image sends, Change and Remove over it.
test('10 Cover: the image fills the frame, Remove sits over it, and a ring shows while it sends', async () => {
  const style = fileStyle('cover')
  const sends = controlled()
  const frame = run(
    { accept: ['image/*'], lanes: 1 },
    [style, ring],
    (model, lift, h) =>
      // A parent that centres its children, as a page's preview frame does.
      h.div(
        [h.Style({ display: 'flex', justifyContent: 'center', inlineSize: '480px' })],
        [
          FileUpload.view(
            {
              model,
              onMessage: lift,
              label: 'Change cover',
              style,
              progress: FileUploadProgress.make({ style: ring }),
              picture: url =>
                Option.match(url, {
                  onNone: () => h.span([h.Id('placeholder')], ['Add a cover']),
                  onSome: src => h.img([h.Src(src), h.Alt('')]),
                }),
            },
            h,
          ),
        ],
      ),
    { send: sends.send },
  )
  try {
    await ready()
    // Empty, the frame is as wide as its place and its words stand in its middle.
    const empty = picker().getBoundingClientRect()
    // The words themselves: a stretched box is centred whatever its text does.
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('placeholder')!)
    const words = range.getBoundingClientRect()
    expect(empty.width).toBeGreaterThan(400)
    // Hovered while empty it is not put under the picture's dark film: a heavy grey slab.
    const edge = getComputedStyle(picker()).borderColor
    await userEvent.hover(picker())
    expect(getComputedStyle(picker(), '::after').content).toBe('none')
    await vi.waitFor(() => expect(getComputedStyle(picker()).borderColor).not.toBe(edge))
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
    expect(Math.abs(words.left + words.width / 2 - (empty.left + empty.width / 2))).toBeLessThan(2)
    expect(Math.abs(words.top + words.height / 2 - (empty.top + empty.height / 2))).toBeLessThan(2)
    drop(picker(), [png('cover.png')])
    await vi.waitFor(() => expect(sends.started).toHaveLength(1))
    await vi.waitFor(() => expect(document.querySelector('img')).not.toBeNull())
    expect(progressBars()).toHaveLength(1)
    // The ring stands in the middle of the image, not after the frame.
    const ring = progressBars()[0]!.getBoundingClientRect()
    const frameBox = picker().getBoundingClientRect()
    expect(
      Math.abs(ring.left + ring.width / 2 - (frameBox.left + frameBox.width / 2)),
    ).toBeLessThan(2)
    expect(
      Math.abs(ring.top + ring.height / 2 - (frameBox.top + frameBox.height / 2)),
    ).toBeLessThan(2)
    const remove = button('Cancel cover.png')
    const box = picker().getBoundingClientRect()
    const at = remove.getBoundingClientRect()
    // Over the frame's corner, not under it.
    expect(at.right).toBeLessThanOrEqual(box.right + 1)
    expect(at.top).toBeGreaterThanOrEqual(box.top - 1)
    expect(box.width / box.height).toBeGreaterThan(1.5)
    sends.succeed(sends.started[0]!, Option.some('/cover.png'))
    await vi.waitFor(() => expect(progressBars()).toHaveLength(0))
    expect(button('Remove cover.png')).not.toBeNull()
  } finally {
    frame.dispose()
  }
})

// 8. Sorting: the grid with grips, by keys and by pointer, focus kept on the grip.
const Rows = Bundle.declare(Reorder.bundle, 'rows')
const SortModel = Schema.Struct({ ...Rows.fields, upload: FileUpload.Model })
type SortModel = typeof SortModel.Type
const SortMessage = defineMessageUnion({
  ...Rows.cases,
  GotUpload: { message: FileUpload.Message },
})
type SortMessage = typeof SortMessage.Type
const SortParent = Bundle.parent({ Model: SortModel, Message: SortMessage })

const mountSorting = (keep: boolean) => {
  const style = fileStyle('zone', 'grid')
  const assembly = SortParent.assemble(
    SortParent.at(Rows, {
      onOut: (fact: Reorder.OutMessage) => (model: SortModel) => {
        const label = (id: string) =>
          model.upload.entries.find(entry => entry.id === id)?.name ?? id
        const said = FileUpload.announce(model.upload, Reorder.announcement(fact, { label }))
        return {
          model: Reorder.OutMessage.match(fact, {
            Moved: move =>
              modifyFields(model, {
                upload: () =>
                  FileUpload.ordered(said, Reorder.apply(FileUpload.ids(model.upload), move)),
              }),
            PickedUp: () => modifyFields(model, { upload: () => said }),
            PassedOver: () => modifyFields(model, { upload: () => said }),
            PutBack: () => modifyFields(model, { upload: () => said }),
          }),
        }
      },
    }),
  )
  const sorting = Reorder.behavior(Rows)(FileUploadSlots)<SortModel, SortMessage>({
    container: 'list',
    item: 'item',
    handle: 'grip',
    items: model => FileUpload.ids(model.upload),
    orientation: 'both',
  })
  const update = assembly.update((model, message) =>
    Match.valueTags(message, {
      GotUpload: ({ message: inner }) => {
        const { model: upload, commands } = FileUpload.update(model.upload, inner)
        return {
          model: upload === model.upload ? model : modifyFields(model, { upload: () => upload }),
          commands: Command.mapMessages(commands ?? [], next =>
            SortMessage.GotUpload({ message: next }),
          ),
        }
      },
    }),
  )
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
  container.id = 'sort-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model: SortModel,
        container,
        init: () => assembly.initial({ upload: FileUpload.init({ id: 'up', multiple: true }) }),
        update,
        view: (model: SortModel, h: HtmlBuilder<SortMessage>) =>
          FileUpload.view(
            {
              model: model.upload,
              onMessage: message => SortMessage.GotUpload({ message }),
              label: 'browse',
              style,
              sort: { input: model, mixin: sorting.mixin },
              mixins: keep ? FileUploadSort.keepFocus : [],
            },
            h,
          ),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
}

const grip = (name: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Reorder ${name}"]`)!

test('8 Sorting: a file is grabbed by Space, moved by the arrow and dropped, the order follows and the grip keeps focus', async () => {
  const handle = mountSorting(true)
  try {
    await ready()
    drop(picker(), [png('a.png'), png('b.png'), png('c.png')])
    await vi.waitFor(() => expect(names()).toEqual(['a.png', 'b.png', 'c.png']))
    grip('a.png').focus()
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(status()).toContain('a.png'))
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(names()).toEqual(['b.png', 'a.png', 'c.png']))
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('a.png')))
    expect(document.querySelector('ul')?.getAttribute('data-sortable')).toBe('')
  } finally {
    handle.dispose()
  }
})

test('probe: without keepFocus a keyed move drops the grip focus', async () => {
  const handle = mountSorting(false)
  try {
    await ready()
    drop(picker(), [png('a.png'), png('b.png')])
    await vi.waitFor(() => expect(names()).toEqual(['a.png', 'b.png']))
    grip('a.png').focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(names()).toEqual(['b.png', 'a.png']))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(document.activeElement).not.toBe(grip('a.png'))
  } finally {
    handle.dispose()
  }
})

test('8 Sorting: the pointer drags a file by its grip to a place before another', async () => {
  const handle = mountSorting(true)
  try {
    await ready()
    drop(picker(), [png('a.png'), png('b.png'), png('c.png')])
    await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(3))
    const first = document.querySelectorAll('li')[0]!
    await userEvent.dragAndDrop(grip('c.png'), first, {
      targetPosition: { x: 4, y: first.getBoundingClientRect().height / 2 },
    })
    await vi.waitFor(() => expect(names()[0]).toBe('c.png'))
  } finally {
    handle.dispose()
  }
})

// Object URLs: each revoked once, whichever way the entry leaves.
test('previews: each object URL is revoked once, on remove and on clear', async () => {
  const revoked: Array<string> = []
  const real = URL.revokeObjectURL.bind(URL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => {
    revoked.push(url)
    real(url)
  })
  const style = fileStyle('zone')
  const handle = run({ multiple: true }, [style], view({ style }))
  try {
    await ready()
    drop(picker(), [png('a.png'), png('b.png'), png('c.png')])
    await vi.waitFor(() => expect(document.querySelectorAll('li img')).toHaveLength(3))
    const urls = Array.from(document.querySelectorAll('li img')).map(each =>
      each.getAttribute('src')!,
    )
    await userEvent.click(button('Remove a.png'))
    await vi.waitFor(() => expect(revoked).toEqual([urls[0]]))
    await userEvent.click(document.querySelector<HTMLElement>('button:not([aria-label])')!)
    await vi.waitFor(() => expect(revoked).toHaveLength(3))
    expect([...revoked].sort()).toEqual([...urls].sort())
  } finally {
    handle.dispose()
  }
})
