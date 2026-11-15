// @vitest-environment jsdom
/**
 * FileInput as markup: a native file input that the trigger labels, a row and a
 * named remove button per file, a disabled field sending nothing, and the
 * helper that folds a pick into the list. The dialog, the focus and the form
 * are `fileInput.browser.test.ts`.
 */
import { Effect } from 'effect'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { FileInput, FileInputSlots, Recipes } from '../src/index.js'
import { FileInputPattern } from '../src/fileInput.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(FileInputSlots)(Recipes.FileInput({}))

const resume = new File(['a'], 'resume.pdf', { type: 'application/pdf', lastModified: 1 })
const photo = new File(['bb'], 'photo.png', { type: 'image/png', lastModified: 2 })

const drawn = (
  files: ReadonlyArray<File>,
  extra: Partial<FileInput.FileInputView<TestMessage>> = {},
) =>
  FileInput.view(
    {
      id: 'cv',
      label: 'Attach a resume',
      files,
      onChange: () => message('Other'),
      onRemove: () => message('Clicked'),
      style,
      ...extra,
    },
    h,
  )

describe('FileInput.view', () => {
  it('meets the file input pattern', () => {
    expect(A11y.validate(FileInputPattern, FileInputSlots)).toEqual([])
  })

  it('draws a native file input that the trigger labels, so the words name it', () => {
    const tree = drawn([])
    const [input] = Inert.byTag(tree, 'input')
    expect(Inert.value(input, 'type')).toBe('file')
    expect(Inert.value(input, 'id')).toBe(FileInput.inputId('cv'))
    const [trigger] = Inert.byTag(tree, 'label')
    expect(Inert.value(trigger, 'for')).toBe(FileInput.inputId('cv'))
    expect(Inert.text(trigger)).toBe('Attach a resume')
  })

  it('draws no list for no files, and a row with a named remove button for each', () => {
    expect(Inert.byTag(drawn([]), 'ul')).toHaveLength(0)
    const tree = drawn([resume, photo])
    expect(Inert.byTag(tree, 'li')).toHaveLength(2)
    expect(Inert.byTag(tree, 'button').map(each => Inert.value(each, 'aria-label'))).toEqual([
      'Remove resume.pdf',
      'Remove photo.png',
    ])
    expect(Inert.byTag(tree, 'button').map(each => Inert.value(each, 'type'))).toEqual([
      'button',
      'button',
    ])
  })

  it('names the remove button in the words given', () => {
    const [remove] = Inert.byTag(drawn([resume], { words: { remove: 'Retirer {name}' } }), 'button')
    expect(Inert.value(remove, 'aria-label')).toBe('Retirer resume.pdf')
  })

  it('passes the form, the kinds, the count and the validity to the native input', () => {
    const [plain] = Inert.byTag(drawn([]), 'input')
    for (const attribute of ['name', 'accept', 'multiple', 'required', 'aria-invalid']) {
      expect(Inert.value(plain, attribute)).toBeUndefined()
    }
    const [input] = Inert.byTag(
      drawn([], {
        name: 'attachments',
        accept: '.pdf,image/*',
        multiple: true,
        required: true,
        invalid: true,
        description: 'Up to 5 MB',
      }),
      'input',
    )
    expect(Inert.value(input, 'name')).toBe('attachments')
    expect(Inert.value(input, 'accept')).toBe('.pdf,image/*')
    expect(Inert.value(input, 'multiple')).toBe(true)
    expect(Inert.value(input, 'required')).toBe(true)
    expect(Inert.value(input, 'aria-invalid')).toBe('true')
    expect(Inert.value(input, 'aria-describedby')).toBe('cv-description')
  })

  it('draws the description under the id the input points at, only when there is one', () => {
    expect(Inert.byTag(drawn([]), 'p')).toHaveLength(0)
    const [description] = Inert.byTag(drawn([], { description: 'Up to 5 MB' }), 'p')
    expect(Inert.value(description, 'id')).toBe('cv-description')
    expect(Inert.text(description)).toBe('Up to 5 MB')
  })

  it('marks the field and its trigger when disabled or invalid, for the style to read', () => {
    const tree = drawn([], { disabled: true, invalid: true })
    for (const node of [...Inert.byTag(tree, 'div'), ...Inert.byTag(tree, 'label')]) {
      expect(Inert.value(node, 'data-disabled')).toBe('')
      expect(Inert.value(node, 'data-invalid')).toBe('')
    }
    const [plain] = Inert.byTag(drawn([]), 'div')
    expect(Inert.value(plain, 'data-disabled')).toBeUndefined()
  })

  type Sent =
    | { readonly _tag: 'Picked'; readonly names: ReadonlyArray<string> }
    | { readonly _tag: 'Removed'; readonly name: string }

  const bound = (files: ReadonlyArray<File>) => (builder: HtmlBuilder<Sent>) =>
    FileInput.view<Sent>(
      {
        id: 'cv',
        label: 'Attach a resume',
        files,
        onChange: picked => ({ _tag: 'Picked', names: picked.map(file => file.name) }),
        onRemove: file => ({ _tag: 'Removed', name: file.name }),
      },
      builder,
    )

  it('sends the file whose remove button was pressed, not another', () => {
    sends(
      bound([resume, photo]),
      Scene.click(Scene.role('button', { name: 'Remove photo.png' })),
      Scene.expectOutMessage({ _tag: 'Removed', name: 'photo.png' }),
    )
  })

  it('sends nothing from a disabled field, and leaves its rows without a remove handler', () => {
    const tree = drawn([resume], { disabled: true })
    const [input] = Inert.byTag(tree, 'input')
    expect(Inert.value(input, 'disabled')).toBe(true)
    expect(input?.data?.on?.['change']).toBeUndefined()
    const [remove] = Inert.byTag(tree, 'button')
    expect(Inert.value(remove, 'disabled')).toBe(true)
    expect(remove?.data?.on?.['click']).toBeUndefined()
  })

  it('is styled in its own slots', () => {
    expect(style.css).toContain('input:focus-visible')
  })
})

describe('FileInput.added', () => {
  const again = new File(['a'], 'resume.pdf', { type: 'application/pdf', lastModified: 1 })
  const edited = new File(['a'], 'resume.pdf', { type: 'application/pdf', lastModified: 9 })

  it('replaces the file in a single field, and keeps it when the dialog was cancelled', () => {
    expect(FileInput.added([resume], [photo])).toEqual([photo])
    expect(FileInput.added([resume], [])).toEqual([resume])
    expect(FileInput.added([resume], [photo, again])[0]).toBe(photo)
    expect(FileInput.added([resume], [photo, again])).toHaveLength(1)
  })

  it('appends in a multiple field, keeping the order', () => {
    const list = FileInput.added([resume], [photo], { multiple: true })
    expect(list[0]).toBe(resume)
    expect(list[1]).toBe(photo)
  })

  it('does not add a file the list holds, though a re-pick is a new File', () => {
    const list = FileInput.added([resume], [again, photo, photo], { multiple: true })
    expect(list).toHaveLength(2)
    expect(list[0]).toBe(resume)
    expect(list[1]).toBe(photo)
  })

  it('tells a changed file from the one held by its modification time', () => {
    expect(FileInput.added([resume], [edited], { multiple: true })).toHaveLength(2)
  })
})

describe('cases', () => {
  it('names every Message the widget Commands answer with', async () => {
    const answers = [
      await Effect.runPromise(FileInput.Sync({ id: 'none', files: [] }).effect),
      await Effect.runPromise(FileInput.Focus({ id: 'none' }).effect),
    ]
    expect(answers.map(answer => answer._tag).sort()).toEqual(Object.keys(FileInput.cases).sort())
  })
})
