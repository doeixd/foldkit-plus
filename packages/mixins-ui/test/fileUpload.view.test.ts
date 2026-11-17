// @vitest-environment jsdom
/**
 * FileUpload as markup: the input before the picker that labels it, every
 * element in a Slot, what is drawn following what the view was given (picture,
 * description, item actions, sort, progress) and the Model, and each part a
 * disabled or read-only field leaves out. The dialog, the drop and the focus
 * are `fileUpload.browser.test.ts`.
 */
import { Option } from 'effect'
import { A11y, Behaviors, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { FileUpload, FileUploadProgress, FileUploadSlots, Recipes } from '../src/index.js'
import { FileUploadPattern } from '../src/fileUpload.js'
import { h, message, type TestMessage } from './fixture.js'

const { Message, Status } = FileUpload

const labelOf = (node: Parameters<typeof Inert.value>[0]): string | undefined => {
  const value = Inert.value(node, 'aria-label')
  return typeof value === 'string' ? value : undefined
}

const style = Style.forSlots(FileUploadSlots)(Recipes.FileUpload({}))

let stamp = 0
const make = (name: string, type = 'text/plain') => {
  stamp += 1
  return new File(['x'.repeat(10)], name, { type, lastModified: stamp })
}

const field = (
  files: ReadonlyArray<File> = [],
  init: Partial<FileUpload.InitOptions> = {},
): FileUpload.Model =>
  files.length === 0
    ? FileUpload.init({ id: 'up', multiple: true, ...init })
    : FileUpload.update(
        FileUpload.init({ id: 'up', multiple: true, ...init }),
        Message.Offered({ files, by: 'drop' }),
      ).model

const options = (
  model: FileUpload.Model,
  extra: Partial<FileUpload.FileUploadView<TestMessage>> = {},
): FileUpload.FileUploadView<TestMessage> => ({
  model,
  onMessage: () => message('Clicked'),
  label: 'Attachments',
  style,
  ...extra,
})

const drawn = (
  model: FileUpload.Model,
  extra: Partial<FileUpload.FileUploadView<TestMessage>> = {},
) => FileUpload.view(options(model, extra), h)

const Drawn = SlotView.forMessages<TestMessage>().define(
  FileUploadSlots,
  (model: FileUpload.Model, _, builder) => FileUpload.view(options(model), builder),
)

describe('FileUpload.view', () => {
  it('meets the file upload pattern', () => {
    expect(A11y.validate(FileUploadPattern, FileUploadSlots)).toEqual([])
  })

  it('draws every element in a Slot, listed files and refusals included', () => {
    const model = field([make('a.txt'), make('b.png', 'image/png')], { maxFiles: 5, maxSize: 99 })
    const refused = FileUpload.update(model, Message.Offered({ files: [], by: 'drop' })).model
    expect(Inert.unslotted(Inert.draw(Drawn, refused))).toEqual([])
  })

  it('draws the input first and the picker that labels it as its next sibling', () => {
    const tree = drawn(field())
    const [input] = Inert.byTag(tree, 'input')
    const [picker] = Inert.byTag(tree, 'label')
    expect(Inert.value(input, 'type')).toBe('file')
    expect(Inert.value(input, 'id')).toBe('up-input')
    expect(Inert.value(picker, 'for')).toBe('up-input')
    expect(Inert.text(picker)).toBe('Attachments')
    const root = Inert.byTag(tree, 'div')[0]!
    const children = Inert.children(root)
    expect(children[0]).toBe(input)
    expect(children[1]).toBe(picker)
  })

  it('draws the status region always, empty until something is said', () => {
    const [status] = Inert.byTag(drawn(field()), 'p')
    expect(Inert.value(status, 'role')).toBe('status')
    expect(Inert.text(status)).toBe('')
    const added = Inert.byTag(drawn(field([make('a.txt')])), 'p').find(
      node => Inert.value(node, 'role') === 'status',
    )
    expect(Inert.text(added!)).toBe('1 added')
  })

  it('passes the limits and the form to the native input', () => {
    const [plain] = Inert.byTag(drawn(field()), 'input')
    for (const attribute of ['name', 'accept', 'required', 'aria-invalid', 'tabindex']) {
      expect(Inert.value(plain, attribute)).toBeUndefined()
    }
    expect(Inert.value(plain, 'multiple')).toBe(true)
    const [input] = Inert.byTag(
      drawn(field([], { accept: ['.pdf', 'image/*'], multiple: false }), {
        name: 'attachments',
        required: true,
        invalid: true,
      }),
      'input',
    )
    expect(Inert.value(input, 'name')).toBe('attachments')
    expect(Inert.value(input, 'accept')).toBe('.pdf,image/*')
    expect(Inert.value(input, 'multiple')).toBeUndefined()
    expect(Inert.value(input, 'required')).toBe(true)
    expect(Inert.value(input, 'aria-invalid')).toBe('true')
  })

  it('points the input at the description, the constraints and the errors it draws', () => {
    const [bare] = Inert.byTag(drawn(field()), 'input')
    expect(Inert.value(bare, 'aria-describedby')).toBeUndefined()
    const model = FileUpload.update(
      field([], { maxFiles: 3, maxSize: 2_000_000 }),
      Message.Offered({ files: [], by: 'drop' }),
    ).model
    const tree = drawn(model, { description: 'PNG only' })
    const [input] = Inert.byTag(tree, 'input')
    expect(Inert.value(input, 'aria-describedby')).toBe('up-description up-constraints up-errors')
    const text = Inert.byTag(tree, 'p').map(node => Inert.text(node))
    expect(text).toContain('PNG only')
    expect(text).toContain('Up to 3 files, 2.0 MB each')
    expect(Inert.text(Inert.byTag(tree, 'li')[0]!)).toBe('Drop files, not text or links')
  })

  it.each([
    [{ maxFiles: 4 }, 'Up to 4 files'],
    [{ maxSize: 1500 }, 'Up to 1.5 kB each'],
  ])('writes the limits %j as %s', (init, said) => {
    const text = Inert.byTag(drawn(field([], init)), 'p').map(node => Inert.text(node))
    expect(text).toContain(said)
  })

  it('draws a list the label names only when it has entries, a row and a named remove button each', () => {
    expect(Inert.byTag(drawn(field()), 'ul')).toHaveLength(0)
    const tree = drawn(field([make('a.txt'), make('b.txt')]))
    const [list] = Inert.byTag(tree, 'ul')
    expect(Inert.value(list, 'aria-label')).toBe('Files')
    expect(Inert.byTag(tree, 'li')).toHaveLength(2)
    expect(
      Inert.byTag(tree, 'button')
        .map(button => Inert.value(button, 'aria-label'))
        .filter(label => label !== undefined),
    ).toEqual(['Remove a.txt', 'Remove b.txt'])
  })

  it('names the remove button Cancel while the file uploads, and offers Try again for a failure that can be retried', () => {
    const base = field([make('a.txt'), make('b.txt')], { lanes: 1 })
    expect(
      Inert.byTag(drawn(base), 'button')
        .map(labelOf)
        .filter(label => label !== undefined),
    ).toEqual(['Cancel a.txt', 'Remove b.txt'])
    const failed = FileUpload.update(
      base,
      Message.Failed({ id: 'local-1', attempt: 1, reason: 'offline', retryable: true }),
    ).model
    const names = Inert.byTag(drawn(failed), 'button').map(each => Inert.value(each, 'aria-label'))
    expect(names).toContain('Try a.txt again')
    const hopeless = FileUpload.update(
      base,
      Message.Failed({ id: 'local-1', attempt: 1, reason: 'too big', retryable: false }),
    ).model
    expect(
      Inert.byTag(drawn(hopeless), 'button').map(each => Inert.value(each, 'aria-label')),
    ).not.toContain('Try a.txt again')
  })

  it('marks each row with its status, and says what a queued or failed file is doing', () => {
    const base = field([make('a.txt'), make('b.txt')], { lanes: 1 })
    const rows = Inert.byTag(drawn(base), 'li')
    expect(rows.map(row => Inert.value(row, 'data-status'))).toEqual(['uploading', 'queued'])
    expect(Inert.text(rows[1]!)).toContain('Waiting')
    expect(Inert.text(rows[0]!)).toContain('Uploading a.txt')
  })

  it('writes the words given, and every placeholder once', () => {
    const tree = drawn(field([make('{name}.txt')]), {
      words: { remove: 'Retirer {name}', list: 'Pièces', added: '{count} de plus' },
    })
    const button = Inert.byTag(tree, 'button').find(each => labelOf(each)?.startsWith('Retirer'))
    expect(Inert.value(button!, 'aria-label')).toBe('Retirer {name}.txt')
    expect(Inert.value(Inert.byTag(tree, 'ul')[0]!, 'aria-label')).toBe('Pièces')
  })

  it('draws a summary and a Clear all button for several files, and none for one file or a single field', () => {
    const several = drawn(field([make('a.txt'), make('b.txt')]))
    const text = Inert.byTag(several, 'div').map(node => Inert.text(node))
    expect(text.some(each => each.startsWith('2 files, 20 B'))).toBe(true)
    expect(Inert.byTag(several, 'button').map(each => Inert.text(each))).toContain('Clear all')
    const single = drawn(field([make('a.txt')], { multiple: false }))
    expect(Inert.byTag(single, 'button').map(each => Inert.text(each))).not.toContain('Clear all')
  })

  describe('what is drawn follows what the view was given', () => {
    const model = field([make('a.png', 'image/png')], { multiple: false })

    it('draws a picture in the picker and no list when given a picture, and marks the root', () => {
      const tree = drawn(model, { picture: () => h.span([], ['face']) })
      const [picker] = Inert.byTag(tree, 'label')
      expect(Inert.text(picker)).toBe('face')
      expect(Inert.byTag(tree, 'ul')).toHaveLength(0)
      expect(Inert.value(Inert.byTag(tree, 'div')[0]!, 'data-picture')).toBe('')
      // The one file's remove button stays, outside the label.
      expect(Inert.byTag(tree, 'button')).toHaveLength(1)
    })

    it("passes the picture the first entry's address, none when nothing is listed", () => {
      const seen: Array<Option.Option<string>> = []
      drawn(field([], { multiple: false }), {
        picture: url => {
          seen.push(url)
          return h.span([], [])
        },
      })
      expect(seen).toEqual([Option.none()])
    })

    it('draws a preview slot per row unless previews are off, an img once the address is known', () => {
      const withPreview = FileUpload.update(
        field([make('a.png', 'image/png')]),
        Message.Previewed({ previews: [{ id: 'local-1', url: 'blob:a' }] }),
      ).model
      expect(Inert.byTag(drawn(withPreview), 'img')).toHaveLength(1)
      expect(Inert.value(Inert.byTag(drawn(withPreview), 'img')[0]!, 'src')).toBe('blob:a')
      expect(Inert.value(Inert.byTag(drawn(withPreview), 'img')[0]!, 'alt')).toBe('')
      const off = field([make('a.png', 'image/png')], { previews: false })
      expect(Inert.byTag(drawn(off), 'img')).toHaveLength(0)
      expect(Inert.byTag(drawn(off), 'li')[0]!).toBeDefined()
    })

    it('draws the actions an item gets, before Remove', () => {
      const tree = drawn(field([make('a.txt')]), {
        itemActions: entry => [h.a([h.Href('/x')], [`Open ${entry.name}`])],
      })
      const [row] = Inert.byTag(tree, 'li')
      const order = Inert.children(Inert.byTag(row!, 'div')[0]!).map(node => Inert.text(node))
      expect(order).toEqual(['Open a.txt', ''])
    })

    it('draws a progress bar for an uploading entry only when given progress, and a state text without it', () => {
      const uploading = field([make('a.txt')], { lanes: 1 })
      expect(
        Inert.byTag(drawn(uploading), 'div').some(
          div => Inert.value(div, 'role') === 'progressbar',
        ),
      ).toBe(false)
      const moved = FileUpload.update(
        uploading,
        Message.Progressed({ id: 'local-1', attempt: 1, loaded: 4, total: 10 }),
      ).model
      const tree = drawn(moved, { progress: FileUploadProgress.make({}) })
      const bar = Inert.byTag(tree, 'div').find(div => Inert.value(div, 'role') === 'progressbar')!
      expect(Inert.value(bar, 'aria-valuenow')).toBe('4')
      expect(Inert.value(bar, 'aria-valuemax')).toBe('10')
      const queued = field([make('a.txt'), make('b.txt')], { lanes: 1 })
      const second = Inert.byTag(
        drawn(queued, { progress: FileUploadProgress.make({}) }),
        'div',
      ).filter(div => Inert.value(div, 'role') === 'progressbar')
      expect(second).toHaveLength(1)
    })

    it('draws grips and marks the list sortable when given sort, and none for a read-only or disabled field', () => {
      const sort = {
        input: undefined,
        mixin: Behaviors.Keys.behavior(FileUploadSlots)<FileUpload.Model, TestMessage>({
          slot: 'grip',
          name: 'Sorting',
          routes: [],
        }).mixin,
      }
      const two = field([make('a.txt'), make('b.txt')])
      const tree = drawn(two, { sort })
      const grips = Inert.byTag(tree, 'button').filter(each => labelOf(each)?.startsWith('Reorder'))
      expect(grips.map(each => Inert.value(each, 'aria-label'))).toEqual([
        'Reorder a.txt',
        'Reorder b.txt',
      ])
      expect(Inert.value(Inert.byTag(tree, 'ul')[0]!, 'data-sortable')).toBe('')
      expect(Inert.value(Inert.byTag(drawn(two), 'ul')[0]!, 'data-sortable')).toBeUndefined()
      for (const state of [{ readOnly: true }, { disabled: true }]) {
        const found = Inert.byTag(drawn(two, { sort, ...state }), 'button').filter(each =>
          labelOf(each)?.startsWith('Reorder'),
        )
        expect(found).toHaveLength(0)
      }
    })
  })

  describe('a disabled field', () => {
    const model = field([make('a.txt')])

    it('disables the input, attaches no drop and drag handling, and disables the buttons', () => {
      const tree = drawn(model, { disabled: true })
      const [input] = Inert.byTag(tree, 'input')
      expect(Inert.value(input, 'disabled')).toBe(true)
      const [picker] = Inert.byTag(tree, 'label')
      expect(Inert.value(picker, 'data-disabled')).toBe('')
      expect(Inert.value(Inert.byTag(tree, 'div')[0]!, 'data-disabled')).toBe('')
      for (const button of Inert.byTag(tree, 'button')) {
        expect(Inert.value(button, 'disabled')).toBe(true)
      }
      const live = drawn(model)
      expect(Inert.value(Inert.byTag(live, 'input')[0]!, 'disabled')).toBeUndefined()
    })
  })

  describe('a read-only field', () => {
    it('draws no picker, remove or Clear all, keeps the input out of the tab order, and still names the files', () => {
      const tree = drawn(field([make('a.txt'), make('b.txt')]), { readOnly: true })
      const [input] = Inert.byTag(tree, 'input')
      expect(Inert.value(input, 'tabindex')).toBe(-1)
      expect(Inert.value(input, 'disabled')).toBeUndefined()
      expect(Inert.byTag(tree, 'label')).toHaveLength(0)
      expect(Inert.byTag(tree, 'button')).toHaveLength(0)
      expect(Inert.byTag(tree, 'li')).toHaveLength(2)
    })
  })

  it('marks an invalid field on the root and the input', () => {
    const tree = drawn(field(), { invalid: true })
    expect(Inert.value(Inert.byTag(tree, 'div')[0]!, 'data-invalid')).toBe('')
    expect(Inert.value(Inert.byTag(tree, 'input')[0]!, 'aria-invalid')).toBe('true')
  })
})

describe('FileUpload.parts', () => {
  it('returns the same drawings view assembles, one per entry, with an Option for each optional part', () => {
    const model = field([make('a.txt'), make('b.txt')], { lanes: 1 })
    const drawnParts = FileUpload.parts(options(model), h)
    expect(drawnParts.items.map(item => item.entry.name)).toEqual(['a.txt', 'b.txt'])
    expect(Option.isSome(drawnParts.picker)).toBe(true)
    expect(Option.isNone(drawnParts.description)).toBe(true)
    expect(Option.isNone(drawnParts.errors)).toBe(true)
    expect(Option.isSome(drawnParts.summary)).toBe(true)
    // No `progress` was given: an uploading entry draws none.
    expect(drawnParts.items.every(item => Option.isNone(item.progress))).toBe(true)
    expect(drawnParts.items.map(item => Option.isSome(item.state))).toEqual([true, true])
    expect(
      Status.match(drawnParts.items[0]!.entry.status, {
        Held: () => 'h',
        Queued: () => 'q',
        Uploading: () => 'u',
        Done: () => 'd',
        Failed: () => 'f',
      }),
    ).toBe('u')
  })
})

describe('FileUpload.conflict', () => {
  const on = (key: string) =>
    Behaviors.Keys.route<FileUpload.Model, TestMessage>('Mine', {
      on: [Behaviors.Keys.chord(key)],
      handle: () => Option.none(),
    })

  it.each(['Enter', ' ', 'Backspace', 'Delete'])('refuses a route on %j', key => {
    const found = FileUpload.conflict([on(key)])
    expect(Option.isSome(found) && found.value.code).toBe('mixins:key-conflict')
  })

  it('takes any other key, and no routes', () => {
    expect(Option.isNone(FileUpload.conflict([on('ArrowDown')]))).toBe(true)
    expect(Option.isNone(FileUpload.conflict([]))).toBe(true)
  })

  it('throws when a view is drawn with a route on Enter', () => {
    expect(() => drawn(field(), { routes: [on('Enter')] })).toThrow('two routes take "Enter"')
  })
})
