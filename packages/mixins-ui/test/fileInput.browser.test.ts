/// <reference types="@vitest/browser-playwright" />
/**
 * FileInput in a real browser: a press on the trigger and Enter or Space on the
 * focused input open the browser's own file dialog, the input is the one tab
 * stop and rings the trigger, a form submits exactly the list the field shows,
 * removing a file keeps focus and lets the same file be chosen again, and the
 * recipe draws the trigger on Button's ladder.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'
import { FileInput, FileInputSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

const Model = Schema.Struct({ files: Schema.Array(Schema.instanceOf(File)) })
const Msg = defineMessageUnion({
  Picked: { files: Schema.Array(Schema.instanceOf(File)) },
  Removed: { file: Schema.instanceOf(File) },
  CompletedSync: {},
  CompletedFocus: {},
})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Options {
  readonly multiple?: boolean
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly size?: 'sm' | 'md' | 'lg'
}

const mount = (options: Options = {}) => {
  const style = Style.forSlots(FileInputSlots)(
    Recipes.FileInput(options.size === undefined ? {} : { size: options.size }),
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
  container.id = 'file-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { files: [] } }),
      update: (
        model: typeof Model.Type,
        message: typeof Msg.Type,
      ): Return<typeof Model.Type, typeof Msg.Type> =>
        Msg.match(message, {
          Picked: ({ files }) => {
            const next = FileInput.added(model.files, files, { multiple: options.multiple })
            return {
              model: modifyFields(model, { files: () => next }),
              commands: [FileInput.Sync({ id: 'cv', files: next })],
            }
          },
          Removed: ({ file }) => {
            const next = model.files.filter(each => each !== file)
            return {
              model: modifyFields(model, { files: () => next }),
              commands: [FileInput.Sync({ id: 'cv', files: next }), FileInput.Focus({ id: 'cv' })],
            }
          },
          CompletedSync: () => ({ model }),
          CompletedFocus: () => ({ model }),
        }),
      view: (model: typeof Model.Type, h: HtmlBuilder<typeof Msg.Type>) =>
        h.form(
          [h.Id('apply')],
          [
            h.button([h.Id('before'), h.Type('button')], ['Before']),
            FileInput.view(
              {
                id: 'cv',
                label: 'Attach a resume',
                files: model.files,
                onChange: files => Msg.Picked({ files }),
                onRemove: file => Msg.Removed({ file }),
                name: 'attachments',
                multiple: options.multiple,
                disabled: options.disabled,
                invalid: options.invalid,
                style,
              },
              h,
            ),
            h.button([h.Id('after'), h.Type('button')], ['After']),
          ],
        ),
    }),
  )
}

const input = () => document.querySelector<HTMLInputElement>('#cv-input')!
const trigger = () => document.querySelector<HTMLElement>('label[for="cv-input"]')!
const ready = () => vi.waitFor(() => expect(trigger()).not.toBeNull())
const rows = () => Array.from(document.querySelectorAll('li')).map(row => row.textContent)
const submitted = () =>
  new FormData(document.querySelector<HTMLFormElement>('#apply')!)
    .getAll('attachments')
    .map(entry => (entry instanceof File ? entry.name : String(entry)))
    // An input holding nothing still submits one nameless part.
    .filter(name => name !== '')

const resume = () => new File(['a'], 'resume.pdf', { type: 'application/pdf' })
const photo = () => new File(['bb'], 'photo.png', { type: 'image/png' })

const picked = async (...files: ReadonlyArray<File>) => {
  await userEvent.upload(input(), [...files])
}

/** Opens of the browser's own dialog, caught by the browser itself, before it can show one. */
const watchDialog = async () => {
  const send = cdp().send as (method: string, params?: object) => Promise<unknown>
  await send('Page.enable')
  await send('Page.setInterceptFileChooserDialog', { enabled: true })
  const opened: Array<string> = []
  cdp().on('Page.fileChooserOpened', () => opened.push('opened'))
  return opened
}

test('a press on the trigger opens the browser file dialog', async () => {
  const handle = mount()
  try {
    await ready()
    const opened = await watchDialog()
    await userEvent.click(trigger())
    await vi.waitFor(() => expect(opened).toHaveLength(1))
  } finally {
    handle.dispose()
  }
})

test('Enter and Space on the focused input open it too, and the input is named by the trigger', async () => {
  const handle = mount()
  try {
    await ready()
    const opened = await watchDialog()
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(opened).toHaveLength(1))
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    await expect.element(page.getByLabelText('Attach a resume')).toBe(input())
  } finally {
    handle.dispose()
  }
})

test('the input is the one tab stop of an empty field, and rings the trigger on keyboard focus only', async () => {
  const handle = mount()
  try {
    await ready()
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(input())
    const ring = getComputedStyle(trigger())
    expect(ring.outlineStyle).not.toBe('none')
    expect(parseFloat(ring.outlineWidth)).toBeGreaterThan(0)
    await userEvent.tab()
    expect(document.activeElement?.id).toBe('after')
    expect(getComputedStyle(trigger()).outlineStyle).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a pick lists the file and a form submits exactly that list', async () => {
  const handle = mount()
  try {
    await ready()
    expect(submitted()).toEqual([])
    await picked(resume())
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
    await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf']))
    await picked(photo())
    await vi.waitFor(() => expect(rows()).toEqual(['photo.png']))
    await vi.waitFor(() => expect(submitted()).toEqual(['photo.png']))
  } finally {
    handle.dispose()
  }
})

test('a multiple field accumulates picks, and removing one leaves the others submitted', async () => {
  const handle = mount({ multiple: true })
  try {
    await ready()
    await picked(resume())
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
    await picked(photo())
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))
    await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf', 'photo.png']))
    await userEvent.click(document.querySelector<HTMLElement>('li button')!)
    await vi.waitFor(() => expect(rows()).toEqual(['photo.png']))
    await vi.waitFor(() => expect(submitted()).toEqual(['photo.png']))
  } finally {
    handle.dispose()
  }
})

test('removing a file with the keyboard keeps focus on the field and empties the native input', async () => {
  const handle = mount()
  try {
    await ready()
    await picked(resume())
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
    await vi.waitFor(() => expect(input().files?.length).toBe(1))
    const remove = document.querySelector<HTMLElement>('li button')!
    remove.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(rows()).toEqual([]))
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
    expect(input().files?.length).toBe(0)
    expect(input().value).toBe('')
    expect(submitted()).toEqual([])
  } finally {
    handle.dispose()
  }
})

test('a removed file can be chosen again', async () => {
  const handle = mount()
  try {
    await ready()
    const file = resume()
    await picked(file)
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
    await userEvent.click(document.querySelector<HTMLElement>('li button')!)
    await vi.waitFor(() => expect(rows()).toEqual([]))
    await picked(file)
    await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
    await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf']))
  } finally {
    handle.dispose()
  }
})

test('a disabled field opens no dialog, takes no focus, and looks off', async () => {
  const handle = mount({ disabled: true })
  try {
    await ready()
    const opened = await watchDialog()
    await userEvent.click(trigger()).catch(() => undefined)
    document.querySelector<HTMLElement>('#before')!.focus()
    await userEvent.tab()
    expect(document.activeElement?.id).toBe('after')
    expect(input().disabled).toBe(true)
    expect(opened).toEqual([])
    const face = getComputedStyle(trigger())
    expect(face.cursor).toBe('not-allowed')
    expect(Number(face.opacity)).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test('the trigger draws on the size ladder (sm, md, lg grow), and an invalid field changes its border', async () => {
  const heights: Record<string, number> = {}
  for (const size of ['sm', 'md', 'lg'] as const) {
    const handle = mount({ size })
    try {
      await ready()
      heights[size] = trigger().getBoundingClientRect().height
    } finally {
      handle.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  expect(heights['sm']).toBeGreaterThan(0)
  expect(heights['sm']).toBeLessThan(heights['md']!)
  expect(heights['md']).toBeLessThan(heights['lg']!)
  const plain = mount()
  let border = ''
  try {
    await ready()
    border = getComputedStyle(trigger()).borderColor
  } finally {
    plain.dispose()
    document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
    document.body.replaceChildren()
  }
  const invalid = mount({ invalid: true })
  try {
    await ready()
    expect(getComputedStyle(trigger()).borderColor).not.toBe(border)
    expect(input().getAttribute('aria-invalid')).toBe('true')
  } finally {
    invalid.dispose()
  }
})

test('the input is a transparent pixel and the trigger is the visible control', async () => {
  const handle = mount()
  try {
    await ready()
    const box = input().getBoundingClientRect()
    expect(box.width).toBeLessThanOrEqual(1)
    expect(box.height).toBeLessThanOrEqual(1)
    expect(getComputedStyle(input()).opacity).toBe('0')
    expect(trigger().getBoundingClientRect().width).toBeGreaterThan(40)
  } finally {
    handle.dispose()
  }
})
