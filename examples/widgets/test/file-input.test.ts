// @vitest-environment jsdom

import { Option } from 'effect'
import { Command } from 'foldkit/scene'
import { Scene } from 'foldkit/test'
import { FileInput } from 'foldkit-mixins-ui'
import { describe, expect, it, test } from 'vitest'
import { FIELD, FORM, Message, ReadSubmission, initial, update } from '../src/file-input/app.js'
import { FileForm } from '../src/file-input/view.js'
import { island } from '../src/file-input/island.js'

const file = (name: string, size = 1) =>
  new File([new Uint8Array(size)], name, { lastModified: 1, type: 'text/plain' })

const resume = file('resume.pdf')
const photo = file('photo.png', 2)
const held = update(initial, Message.Picked({ files: [resume, photo] })).model

// A Command carries its Effect, which `toEqual` cannot compare: read what it was asked.
const asked = (commands: ReturnType<typeof update>['commands']) =>
  (commands ?? []).map(command => [command.name, command.args])

describe('update', () => {
  it('a pick adds files and writes the whole list back into the input', () => {
    const result = update(initial, Message.Picked({ files: [resume, photo] }))
    expect(result.model.files).toEqual([resume, photo])
    expect(asked(result.commands)).toEqual([
      ['FileInput.Sync', { id: FIELD, files: [resume, photo] }],
    ])
  })

  it('a pick of a file already listed changes nothing but is still written back', () => {
    const result = update(held, Message.Picked({ files: [file('resume.pdf')] }))
    expect(result.model).toBe(held)
    expect(asked(result.commands)).toEqual([
      ['FileInput.Sync', { id: FIELD, files: [resume, photo] }],
    ])
  })

  it('a cancelled dialog, which empties the input, writes the list back', () => {
    const result = update(held, Message.Picked({ files: [] }))
    expect(result.model).toBe(held)
    expect(asked(result.commands)).toEqual([
      ['FileInput.Sync', { id: FIELD, files: [resume, photo] }],
    ])
  })

  it('removing a row writes the rest back and returns focus to the input', () => {
    const result = update(held, Message.Removed({ file: resume }))
    expect(result.model.files).toEqual([photo])
    expect(asked(result.commands)).toEqual([
      ['FileInput.Sync', { id: FIELD, files: [photo] }],
      ['FileInput.Focus', { id: FIELD }],
    ])
  })

  it('removing a file the list does not hold is a no-op', () => {
    expect(update(held, Message.Removed({ file: file('other.txt') }))).toEqual({ model: held })
  })

  it('a change to the list drops the receipt of the last submit', () => {
    const receipt = update(held, Message.GotSubmission({ names: ['resume.pdf'] })).model
    expect(receipt.receipt).toEqual(Option.some(['resume.pdf']))
    expect(update(receipt, Message.Picked({ files: [file('c.txt')] })).model.receipt).toEqual(
      Option.none(),
    )
    expect(update(receipt, Message.Removed({ file: resume })).model.receipt).toEqual(Option.none())
  })

  it('a submit reads the form', () => {
    const result = update(held, Message.Submitted())
    expect(result.model).toBe(held)
    expect(asked(result.commands)).toEqual([['ReadSubmission', { form: FORM }]])
  })
})

test('the rows name each file, and a pressed remove button writes the list and the focus back', () => {
  Scene.scene(
    { update, view: FileForm },
    Scene.given(held),
    Scene.expectAll(Scene.all.role('listitem')).toHaveCount(2),
    Scene.click(Scene.role('button', { name: 'Remove resume.pdf' })),
    Command.expectExact(
      FileInput.Sync({ id: FIELD, files: [photo] }),
      FileInput.Focus({ id: FIELD }),
    ),
    Command.resolveAll(
      [FileInput.Sync, FileInput.Message.CompletedSync()],
      [FileInput.Focus, FileInput.Message.CompletedFocus()],
    ),
    Scene.expectAll(Scene.all.role('listitem')).toHaveCount(1),
    Scene.expect(Scene.text('photo.png')).toExist(),
    Scene.expect(Scene.text('resume.pdf')).not.toExist(),
  )
})

test('a submit shows the names the form held, and a status region stands ready before it', () => {
  Scene.scene(
    { update, view: FileForm },
    Scene.given(held),
    Scene.expect(Scene.role('status')).toExist(),
    Scene.submit(Scene.selector(`#${FORM}`)),
    Command.resolve(ReadSubmission, Message.GotSubmission({ names: ['resume.pdf', 'photo.png'] })),
    Scene.expect(Scene.role('status')).toHaveText('Submitted resume.pdf, photo.png'),
  )
})

test('the trace tells the same story', () => {
  expect(island.runDemo()).toEqual([
    'picked resume.pdf and photo.png: rows=[resume.pdf, photo.png] commands=[FileInput.Sync]',
    'picked resume.pdf again: rows=[resume.pdf, photo.png] commands=[FileInput.Sync]',
    'removed resume.pdf: rows=[photo.png] commands=[FileInput.Sync, FileInput.Focus]',
  ])
})
