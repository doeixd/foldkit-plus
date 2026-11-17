/// <reference types="@vitest/browser-playwright" />
/**
 * The file form in a real browser: what the form submits is what the rows list
 * (read from `FormData`, as a native submit would send it), and removing a row
 * with the keyboard leaves focus on the field instead of on the page.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { FORM, Model, NAME, initial, update } from '../src/file-input/app.js'
import { FieldStyle, FileForm, FormStyle, SubmitStyle } from '../src/file-input/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(FormStyle, FieldStyle, SubmitStyle)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'file-input'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: FileForm,
    }),
  ).dispose
  await vi.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull())
}

const input = () => {
  const field = document.querySelector('input[type="file"]')
  if (!(field instanceof HTMLInputElement)) throw new Error('the file input is not drawn')
  return field
}
const rows = () => Array.from(document.querySelectorAll('li > span')).map(row => row.textContent)
const removeButton = (name: string) => page.getByRole('button', { name: `Remove ${name}` })
const receipt = () => document.querySelector('[role="status"]')?.textContent

// An input holding no file still submits one nameless part.
const submitted = () => {
  const form = document.forms.namedItem(FORM)
  return form === null
    ? []
    : new FormData(form)
        .getAll(NAME)
        .flatMap(entry =>
          entry instanceof File && entry.name !== '' ? [`${entry.name}:${entry.size}`] : [],
        )
}

/**
 * A pick as the dialog makes it: the same file from disk keeps its modification
 * time, which `userEvent.upload` does not (the file it builds is stamped now, so
 * it never repeats one), hence the input is set directly and `change` fired.
 */
const pickFromDisk = (...files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  input().files = transfer.files
  input().dispatchEvent(new Event('change', { bubbles: true }))
}

const resume = () => new File(['a'], 'resume.pdf', { type: 'application/pdf', lastModified: 1 })
const photo = () => new File(['bb'], 'photo.png', { type: 'image/png', lastModified: 1 })
const notes = () => new File(['ccc'], 'notes.txt', { type: 'text/plain', lastModified: 1 })

it('submits exactly the files the rows list, through picks, a repeat and a cancelled dialog', async () => {
  await mount()
  expect(submitted()).toEqual([])

  pickFromDisk(resume(), photo())
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))
  await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf:1', 'photo.png:2']))

  pickFromDisk(notes())
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png', 'notes.txt']))
  await vi.waitFor(() =>
    expect(submitted()).toEqual(['resume.pdf:1', 'photo.png:2', 'notes.txt:3']),
  )

  // The same file again adds no row, and the emptied input is written back.
  pickFromDisk(photo())
  await vi.waitFor(() => expect(input().files).toHaveLength(3))
  expect(submitted()).toHaveLength(3)
  expect(rows()).toEqual(['resume.pdf', 'photo.png', 'notes.txt'])

  // A cancelled dialog also empties the input.
  await userEvent.upload(input(), [])
  await vi.waitFor(() => expect(input().files).toHaveLength(3))
  expect(submitted()).toHaveLength(3)
  expect(rows()).toEqual(['resume.pdf', 'photo.png', 'notes.txt'])
})

it('removing a row with the keyboard leaves the form holding the rest and focus on the field', async () => {
  await mount()
  await userEvent.upload(input(), [resume(), photo()])
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))

  removeButton('resume.pdf').element().focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(rows()).toEqual(['photo.png']))
  await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  expect(submitted()).toEqual(['photo.png:2'])

  removeButton('photo.png').element().focus()
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  expect(submitted()).toEqual([])
})

it('a removed file can be picked again, and a submit names what the form held', async () => {
  await mount()
  await userEvent.upload(input(), [resume()])
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
  await userEvent.click(removeButton('resume.pdf'))
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await userEvent.upload(input(), [resume(), photo()])
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))

  await userEvent.click(page.getByRole('button', { name: 'Submit' }))
  await vi.waitFor(() => expect(receipt()).toBe('Submitted resume.pdf, photo.png'))
  expect(submitted()).toEqual(['resume.pdf:1', 'photo.png:2'])

  await userEvent.upload(input(), [notes()])
  await vi.waitFor(() => expect(receipt()).toBe(''))
  await userEvent.click(removeButton('resume.pdf'))
  await userEvent.click(removeButton('photo.png'))
  await userEvent.click(removeButton('notes.txt'))
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await userEvent.click(page.getByRole('button', { name: 'Submit' }))
  await vi.waitFor(() => expect(receipt()).toBe('Submitted no files'))
})
