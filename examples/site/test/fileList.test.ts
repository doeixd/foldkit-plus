/**
 * The list the FileInput examples own: each pick added once to a multiple
 * list and replacing a single one, and the Commands a pick or a remove asks
 * for, which put the input's files and the focus right.
 */
import { describe, expect, it } from 'vitest'
import { fileList, Message } from '../src/snippets/fileList.js'

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name)

describe('the FileInput examples’ list', () => {
  it('adds each pick to a multiple list once, and replaces a single one', () => {
    const a = file('a.png')
    const b = file('b.png')
    const names = (options: { readonly multiple: boolean }) => {
      const list = fileList('files', options)
      const picked = [[a], [b, a]].reduce(
        (model, files) => list.update(model, Message.Picked({ files })).model,
        list.init().model,
      )
      return picked.files.map(held => held.name)
    }
    expect(names({ multiple: true })).toEqual(['a.png', 'b.png'])
    expect(names({ multiple: false })).toEqual(['b.png'])
  })

  it('writes the list back into the input on a pick, and asks for focus on a remove', () => {
    const list = fileList('files', { multiple: true })
    const a = file('a.png')
    const b = file('b.png')
    const picked = list.update(list.init().model, Message.Picked({ files: [a, b] }))
    expect(picked.commands.map(command => command.name)).toEqual(['FileInput.Sync'])
    const removed = list.update(picked.model, Message.Removed({ file: a }))
    // By identity: a file of the same name and size is another file.
    expect(removed.model.files).toEqual([b])
    expect(removed.model.files[0]).toBe(b)
    expect(removed.commands.map(command => command.name)).toEqual([
      'FileInput.Sync',
      'FileInput.Focus',
    ])
    expect(
      list.update(picked.model, Message.Removed({ file: file('a.png') })).model.files,
    ).toHaveLength(2)
  })
})
