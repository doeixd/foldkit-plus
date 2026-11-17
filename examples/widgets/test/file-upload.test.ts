// @vitest-environment jsdom

import { Option } from 'effect'
import { Command } from 'foldkit/scene'
import { Scene } from 'foldkit/test'
import { FileUpload } from 'foldkit-mixins-ui'
import { describe, expect, it, test } from 'vitest'
import { FORM, Message, ReadSubmission, initial, update } from '../src/file-upload/app.js'
import { island } from '../src/file-upload/island.js'
import { FileUploadForm } from '../src/file-upload/view.js'

const file = (name: string, size = 1, type = 'text/plain') =>
  new File([new Uint8Array(size)], name, { lastModified: 1, type })

const offer = (files: ReadonlyArray<File>) =>
  Message.GotUpload({ message: FileUpload.Message.Offered({ files, by: 'drop' }) })

const resume = file('resume.pdf', 1, 'application/pdf')
const photo = file('photo.png', 2, 'image/png')
const held = update(initial(), offer([resume, photo])).model

const asked = (commands: ReturnType<typeof update>['commands']) =>
  (commands ?? []).map(command => command.name)

describe('update', () => {
  it('a drop lists the files and writes the list into the input', () => {
    const result = update(initial(), offer([resume, photo]))
    expect(result.model.upload.entries.map(entry => entry.name)).toEqual([
      'resume.pdf',
      'photo.png',
    ])
    expect(asked(result.commands)).toEqual(['FileInput.Sync', 'FileUpload.Preview'])
  })

  it('refuses a kind, a size and a sixth file by name, and lists the rest', () => {
    const result = update(
      initial(),
      offer([file('notes.txt'), file('scan.pdf', 2_000_001, 'application/pdf'), resume]),
    )
    expect(result.model.upload.entries.map(entry => entry.name)).toEqual(['resume.pdf'])
    expect(result.model.upload.refusals.map(refusal => refusal._tag)).toEqual(['Kind', 'TooLarge'])
  })

  it('a change to the list drops the receipt of the last submit', () => {
    const receipt = update(held, Message.GotSubmission({ names: ['resume.pdf'] })).model
    expect(receipt.receipt).toEqual(Option.some(['resume.pdf']))
    const dropped = update(receipt, offer([file('c.pdf', 1, 'application/pdf')])).model
    expect(dropped.receipt).toEqual(Option.none())
    const dragged = update(
      receipt,
      Message.GotUpload({ message: FileUpload.Message.DragEntered() }),
    ).model
    expect(dragged.receipt).toEqual(Option.some(['resume.pdf']))
  })

  it('a no-op returns the Model it was given', () => {
    expect(
      update(held, Message.GotUpload({ message: FileUpload.Message.DismissedRefusals() })).model,
    ).toBe(held)
  })

  it('a submit reads the form', () => {
    const result = update(held, Message.Submitted())
    expect(result.model).toBe(held)
    expect((result.commands ?? []).map(command => [command.name, command.args])).toEqual([
      ['ReadSubmission', { form: FORM }],
    ])
  })
})

test('the rows name each file, and Remove is named for it', () => {
  Scene.scene(
    { update, view: FileUploadForm },
    Scene.given(held),
    Scene.expectAll(Scene.all.role('listitem')).toHaveCount(2),
    Scene.expect(Scene.role('button', { name: 'Remove resume.pdf' })).toExist(),
    Scene.expect(Scene.role('button', { name: 'Remove photo.png' })).toExist(),
  )
})

test('a submit shows the names the form held, and a status region stands ready before it', () => {
  Scene.scene(
    { update, view: FileUploadForm },
    Scene.given(held),
    Scene.expectAll(Scene.all.role('status')).toHaveCount(2),
    Scene.submit(Scene.selector(`#${FORM}`)),
    Command.resolve(ReadSubmission, Message.GotSubmission({ names: ['resume.pdf', 'photo.png'] })),
    Scene.expect(Scene.text('Submitted resume.pdf, photo.png')).toExist(),
  )
})

test('the trace tells the same story', () => {
  expect(island.runDemo()).toEqual([
    'dropped resume.pdf and photo.png: rows=[resume.pdf, photo.png] refused=[] commands=[FileInput.Sync, FileUpload.Preview]',
    'dropped notes.txt: rows=[resume.pdf, photo.png] refused=[Kind] commands=[]',
    'dropped a 3 MB scan: rows=[resume.pdf, photo.png] refused=[TooLarge] commands=[]',
    'removed resume.pdf: rows=[photo.png] refused=[TooLarge] commands=[FileInput.Sync, FileUpload.Focus]',
  ])
})
