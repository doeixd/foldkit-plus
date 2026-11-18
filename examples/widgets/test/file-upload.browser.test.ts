/// <reference types="@vitest/browser-playwright" />
/**
 * The upload form in a real browser: what the form submits is what the rows
 * list (read from `FormData`, as a native submit would send it) after a pick and
 * a drop, and removing a row with the keyboard leaves focus on the next row's
 * button, and on the field after the last.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { FORM, Model, NAME, initial, update } from '../src/file-upload/app.js'
import { FieldStyle, FileUploadForm, FormStyle, SubmitStyle } from '../src/file-upload/view.js'
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
  container.id = 'file-upload'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial() }),
      update,
      view: FileUploadForm,
    }),
  ).dispose
  await vi.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull())
}

const input = () => {
  const field = document.querySelector('input[type="file"]')
  if (!(field instanceof HTMLInputElement)) throw new Error('the file input is not drawn')
  return field
}
const picker = () => document.querySelector<HTMLElement>('label')!
const rows = () => Array.from(document.querySelectorAll('li [title]')).map(row => row.textContent)
const removeButton = (name: string) => page.getByRole('button', { name: `Remove ${name}` })
const receipt = () => document.querySelector('form > p[role="status"]')?.textContent

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

const drop = (...files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  picker().dispatchEvent(
    new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
  )
}

const resume = () => new File(['a'], 'resume.pdf', { type: 'application/pdf', lastModified: 1 })
const photo = () => new File(['bb'], 'photo.png', { type: 'image/png', lastModified: 1 })
const notes = () => new File(['ccc'], 'notes.txt', { type: 'text/plain', lastModified: 1 })

it('submits exactly the files the rows list, through a pick, a drop and a refused file', async () => {
  await mount()
  expect(submitted()).toEqual([])

  await userEvent.upload(input(), [resume()])
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf']))
  await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf:1']))

  drop(photo())
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))
  await vi.waitFor(() => expect(submitted()).toEqual(['resume.pdf:1', 'photo.png:2']))

  // A kind the field does not take is refused by name and is not posted.
  drop(notes())
  await vi.waitFor(() =>
    expect(document.querySelector('ul')?.textContent).toBe('notes.txt is not an accepted type'),
  )
  expect(submitted()).toEqual(['resume.pdf:1', 'photo.png:2'])
})

it('removing a row with the keyboard leaves the form holding the rest and focus on a neighbour', async () => {
  await mount()
  drop(resume(), photo())
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))

  removeButton('resume.pdf').element().focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(rows()).toEqual(['photo.png']))
  await vi.waitFor(() => expect(document.activeElement).toBe(removeButton('photo.png').element()))
  expect(submitted()).toEqual(['photo.png:2'])

  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  expect(submitted()).toEqual([])
})

it('a submit names what the form held, and a change to the list clears the receipt', async () => {
  await mount()
  drop(resume(), photo())
  await vi.waitFor(() => expect(rows()).toEqual(['resume.pdf', 'photo.png']))
  await userEvent.click(page.getByRole('button', { name: 'Submit' }))
  await vi.waitFor(() => expect(receipt()).toBe('Submitted resume.pdf, photo.png'))
  await userEvent.click(removeButton('photo.png'))
  await vi.waitFor(() => expect(receipt()).toBe(''))
  await userEvent.click(removeButton('resume.pdf'))
  await userEvent.click(page.getByRole('button', { name: 'Submit' }))
  await vi.waitFor(() => expect(receipt()).toBe('Submitted no files'))
})
