// @vitest-environment jsdom
/**
 * FileUpload as a transition: an offer is judged file by file and listed,
 * previewed and promoted into lanes; removals, retries and stale answers
 * change only what they name. The drawing, the dialog, the drop and the focus
 * are `fileUpload.browser.test.ts`.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { FileUpload } from '../src/index.js'

const { Message, Refusal, Status, update, init, accepts } = FileUpload

let stamp = 0
/** A file no other call makes: distinct name, size and time, so only the check under test can refuse it. */
const make = (name: string, { size = 10, type = 'text/plain' } = {}) => {
  stamp += 1
  return new File(['x'.repeat(size)], name, { type, lastModified: stamp })
}

const offered = (
  model: FileUpload.Model,
  files: ReadonlyArray<File>,
  by: 'pick' | 'drop' | 'paste' = 'pick',
) => update(model, Message.Offered({ files, by }))

const names = (model: FileUpload.Model) => model.entries.map(entry => entry.name)
const commandNames = (commands: ReadonlyArray<{ readonly name: string }> | undefined) =>
  (commands ?? []).map(command => command.name)

const statusOf = (model: FileUpload.Model, id: string) =>
  Status.match(model.entries.find(entry => entry.id === id)!.status, {
    Held: () => 'Held',
    Queued: () => 'Queued',
    Uploading: ({ lane }) => `Uploading ${lane}`,
    Done: () => 'Done',
    Failed: () => 'Failed',
  })

describe('FileUpload.init', () => {
  it.each([
    ['an accept token that is no kind', { accept: ['pdf'] }, 'accept'],
    ['a wildcard subtype', { accept: ['image/png/*'] }, 'accept'],
    ['a negative maxSize', { maxSize: -1 }, 'maxSize'],
    ['a fractional maxFiles', { multiple: true, maxFiles: 1.5 }, 'maxFiles'],
    ['a fractional lanes', { lanes: 0.5 }, 'lanes'],
    ['maxFiles without multiple', { maxFiles: 2 }, 'maxFiles'],
  ] as const)('throws, naming the option, for %s', (_, options, option) => {
    expect(() => init({ id: 'up', ...options })).toThrow(option)
  })

  const stored = (id: string) => ({
    id,
    name: `${id}.png`,
    size: 5,
    type: 'image/png',
    url: `/${id}.png`,
  })

  it('throws for duplicate initial ids and for several initial files in a single field', () => {
    expect(() => init({ id: 'up', multiple: true, initial: [stored('a'), stored('a')] })).toThrow(
      'distinct',
    )
    expect(() => init({ id: 'up', initial: [stored('a'), stored('b')] })).toThrow('multiple')
  })

  it('normalises kinds and lists the initial files as stored and held', () => {
    const model = init({ id: 'up', accept: [' IMAGE/* ', '.PDF'], initial: [stored('a')] })
    expect(model.accept).toEqual(['image/*', '.pdf'])
    expect(model.entries).toHaveLength(1)
    expect(model.entries[0]?.source._tag).toBe('Stored')
    expect(statusOf(model, 'a')).toBe('Held')
  })
})

describe('FileUpload.accepts', () => {
  it.each([
    ['everything when no kinds', [], 'a.bin', '', true],
    ['an extension, ignoring case', ['.pdf'], 'CV.PDF', 'application/pdf', true],
    ['an extension by the end of the name', ['.pdf'], 'a.pdf.txt', 'text/plain', false],
    ['an extension with no type', ['.pdf'], 'a.pdf', '', true],
    ['a wildcard by the type prefix', ['image/*'], 'a', 'image/png', true],
    ['a wildcard against another family', ['image/*'], 'a.png', 'text/plain', false],
    ['a wildcard with no type', ['image/*'], 'a.png', '', false],
    ['an exact type', ['application/pdf'], 'a', 'Application/PDF', true],
    ['an exact type, not its neighbour', ['image/png'], 'a', 'image/jpeg', false],
    ['any of several', ['.csv', 'text/csv'], 'a', 'text/csv', true],
  ] as const)('takes %s', (_, tokens, name, type, expected) => {
    expect(accepts(tokens, { name, type })).toBe(expected)
  })
})

describe('FileUpload.update, Offered', () => {
  const field = (extra: Partial<FileUpload.InitOptions> = {}) =>
    init({ id: 'up', multiple: true, ...extra })

  it.each([
    ['a kind the field does not accept', { accept: ['image/*'] }, () => make('a.txt'), 'Kind'],
    ['a file over maxSize', { maxSize: 5 }, () => make('big.txt', { size: 6 }), 'TooLarge'],
  ] as const)('refuses %s, alone', (_, options, build, tag) => {
    const { model, outMessage } = offered(field(options), [build()])
    expect(model.entries).toEqual([])
    expect(model.refusals.map(refusal => refusal._tag)).toEqual([tag])
    expect(outMessage?._tag).toBe('Picked')
  })

  it('refuses a file already listed, and one twice in the same batch', () => {
    const first = make('a.txt')
    const listed = offered(field(), [first]).model
    const again = new File(['x'.repeat(10)], first.name, {
      type: first.type,
      lastModified: first.lastModified,
    })
    const second = make('b.txt')
    const { model } = offered(listed, [again, second, second])
    expect(names(model)).toEqual(['a.txt', 'b.txt'])
    expect(model.refusals.map(refusal => refusal._tag)).toEqual(['Duplicate', 'Duplicate'])
  })

  it('judges kind before size before duplicate', () => {
    const file = make('a.txt', { size: 50 })
    const { model } = offered(field({ accept: ['image/*'], maxSize: 5 }), [file])
    expect(model.refusals).toEqual([Refusal.Kind({ name: 'a.txt' })])
    const big = offered(field({ maxSize: 5 }), [file]).model
    expect(big.refusals[0]?._tag).toBe('TooLarge')
  })

  it('adds none of a batch that would pass maxFiles, and says so once', () => {
    const base = offered(field({ maxFiles: 2 }), [make('a.txt')]).model
    const { model, outMessage } = offered(base, [make('b.txt'), make('c.txt')])
    expect(names(model)).toEqual(['a.txt'])
    expect(model.refusals).toEqual([Refusal.TooMany({ max: 2 })])
    expect(outMessage).toMatchObject({ _tag: 'Picked', added: [] })
    expect(offered(base, [make('b.txt')]).model.entries).toHaveLength(2)
  })

  it('counts stored files against maxFiles', () => {
    const full = field({
      maxFiles: 1,
      initial: [{ id: 's', name: 's.png', size: 1, type: 'image/png', url: '/s.png' }],
    })
    expect(offered(full, [make('a.txt')]).model.refusals[0]?._tag).toBe('TooMany')
  })

  it('lists what passes beside what is refused, and notes the count added', () => {
    const { model, outMessage } = offered(field({ maxSize: 5 }), [
      make('ok.txt', { size: 1 }),
      make('big.txt', { size: 9 }),
    ])
    expect(names(model)).toEqual(['ok.txt'])
    expect(model.refusals.map(refusal => refusal._tag)).toEqual(['TooLarge'])
    expect(model.notice).toEqual(Option.some({ _tag: 'Added', count: 1 }))
    expect(outMessage).toMatchObject({ added: ['local-1'], replaced: [] })
  })

  it('notes a refusal alone as Refused', () => {
    const { model } = offered(field({ maxSize: 5 }), [make('big.txt', { size: 9 })])
    expect(model.notice).toEqual(Option.some({ _tag: 'Refused', count: 1 }))
  })

  it('a cancelled dialog is no change; an empty drop or paste is NotFiles', () => {
    const model = field()
    expect(offered(model, [], 'pick').model).toBe(model)
    expect(offered(model, [], 'drop').model.refusals).toEqual([Refusal.NotFiles()])
    expect(offered(model, [], 'paste').model.refusals).toEqual([Refusal.NotFiles()])
  })

  it('mints ids that skip one already taken, and clears dragging', () => {
    const taken = init({
      id: 'up',
      multiple: true,
      initial: [{ id: 'local-1', name: 's.png', size: 1, type: 'image/png', url: '/s.png' }],
    })
    const dragged = update(taken, Message.DragEntered()).model
    const { model } = offered(dragged, [make('a.txt'), make('b.txt')], 'drop')
    expect(model.entries.map(entry => entry.id)).toEqual(['local-1', 'local-2', 'local-3'])
    expect(model.dragging).toBe(false)
  })

  describe('a single field', () => {
    const single = (extra: Partial<FileUpload.InitOptions> = {}) => init({ id: 'up', ...extra })

    it('judges only the first file and lists it', () => {
      const first = make('a.txt')
      const { model } = offered(single({ accept: ['.txt'] }), [first, make('b.png')])
      expect(names(model)).toEqual(['a.txt'])
      expect(model.refusals).toEqual([])
    })

    it('replaces the held entry by a valid file, reporting its id and revoking its preview', () => {
      const held = offered(single(), [make('a.png', { type: 'image/png' })]).model
      const previewed = update(
        held,
        Message.Previewed({ previews: [{ id: 'local-1', url: 'blob:a' }] }),
      ).model
      const { model, outMessage, commands } = offered(previewed, [make('b.txt')])
      expect(names(model)).toEqual(['b.txt'])
      expect(outMessage).toMatchObject({ added: ['local-2'], replaced: ['local-1'] })
      expect(commandNames(commands)).toContain('FileUpload.Revoke')
    })

    it('leaves the held entry alone when the new file is invalid', () => {
      const held = offered(single({ maxSize: 20 }), [make('a.txt')]).model
      const { model } = offered(held, [make('big.txt', { size: 30 })])
      expect(names(model)).toEqual(['a.txt'])
      expect(model.refusals[0]?._tag).toBe('TooLarge')
    })

    it('takes the same file again as a replacement, not a duplicate', () => {
      const file = make('a.txt')
      const held = offered(single(), [file]).model
      const { model } = offered(held, [file])
      expect(model.refusals).toEqual([])
      expect(model.entries).toHaveLength(1)
    })
  })

  describe('its Commands', () => {
    it('writes the local files back into the input, so a form posts them', () => {
      const file = make('a.txt')
      const { commands } = offered(field(), [file], 'drop')
      expect(commandNames(commands)).toEqual(['FileInput.Sync'])
      const [sync] = commands ?? []
      expect(sync?.args).toMatchObject({ id: 'up' })
      expect((sync?.args as { files: ReadonlyArray<File> }).files[0]).toBe(file)
    })

    it('asks for a preview of an added image only, and only when previews are on', () => {
      const image = make('a.png', { type: 'image/png' })
      const text = make('b.txt')
      const { commands } = offered(field(), [image, text])
      expect(commandNames(commands)).toEqual(['FileInput.Sync', 'FileUpload.Preview'])
      const preview = (commands ?? []).find(command => command.name === 'FileUpload.Preview')
      const files = (preview?.args as { files: ReadonlyArray<{ id: string; file: File }> }).files
      expect(files).toHaveLength(1)
      expect(files[0]?.file).toBe(image)
      expect(commandNames(offered(field({ previews: false }), [image]).commands)).toEqual([
        'FileInput.Sync',
      ])
    })

    it('writes nothing for a refused drop, which left the input alone, and the list back after a refused pick, which emptied it', () => {
      const big = make('big.txt', { size: 9 })
      const small = field({ maxSize: 1 })
      expect(commandNames(offered(small, [big], 'drop').commands)).toEqual([])
      expect(commandNames(offered(small, [big], 'pick').commands)).toEqual(['FileInput.Sync'])
    })

    it('writes the list back when the dialog is cancelled, if it holds a file', () => {
      const held = offered(field(), [make('a.txt')]).model
      const cancelled = offered(held, [], 'pick')
      expect(cancelled.model).toBe(held)
      expect(commandNames(cancelled.commands)).toEqual(['FileInput.Sync'])
    })
  })
})

describe('FileUpload.update, lanes', () => {
  const five = () => ['a', 'b', 'c', 'd', 'e'].map(name => make(`${name}.txt`))
  const sending = () => offered(init({ id: 'up', multiple: true, lanes: 3 }), five()).model

  it('holds every file when the field has no lanes', () => {
    const { model } = offered(init({ id: 'up', multiple: true }), five())
    expect(model.entries.map(entry => statusOf(model, entry.id))).toEqual(Array(5).fill('Held'))
  })

  it('starts the first files in the lanes and queues the rest', () => {
    const model = sending()
    expect(model.entries.map(entry => statusOf(model, entry.id))).toEqual([
      'Uploading 0',
      'Uploading 1',
      'Uploading 2',
      'Queued',
      'Queued',
    ])
    expect(model.entries[0]?.attempts).toBe(1)
    expect(model.entries[3]?.attempts).toBe(0)
  })

  it('a finish promotes the next queued file into the same lane and leaves the others be', () => {
    const model = sending()
    const done = update(
      model,
      Message.Succeeded({ id: 'local-2', attempt: 1, url: Option.none() }),
    ).model
    expect(done.entries.map(entry => statusOf(done, entry.id))).toEqual([
      'Uploading 0',
      'Done',
      'Uploading 2',
      'Uploading 1',
      'Queued',
    ])
    expect(done.entries[0]).toBe(model.entries[0])
    expect(done.entries[2]).toBe(model.entries[2])
  })

  it('a failure frees its lane the same way, and a retry queues it again', () => {
    const model = sending()
    const failed = update(
      model,
      Message.Failed({ id: 'local-1', attempt: 1, reason: 'offline', retryable: true }),
    ).model
    expect(statusOf(failed, 'local-1')).toBe('Failed')
    expect(statusOf(failed, 'local-4')).toBe('Uploading 0')
    const { model: retried, commands } = update(failed, Message.Retried({ id: 'local-1' }))
    expect(statusOf(retried, 'local-1')).toBe('Queued')
    expect(commandNames(commands)).toEqual(['FileUpload.Focus'])
    const next = update(
      retried,
      Message.Succeeded({ id: 'local-4', attempt: 1, url: Option.none() }),
    ).model
    // First by list order: the retried entry stands before local-5.
    expect(statusOf(next, 'local-1')).toBe('Uploading 0')
    expect(statusOf(next, 'local-5')).toBe('Queued')
  })

  it('a retry starts at once when a lane is free, as the next attempt', () => {
    const one = offered(init({ id: 'up', multiple: true, lanes: 1 }), [make('a.txt')]).model
    const failed = update(
      one,
      Message.Failed({ id: 'local-1', attempt: 1, reason: 'offline', retryable: true }),
    ).model
    const retried = update(failed, Message.Retried({ id: 'local-1' })).model
    const entry = retried.entries[0]!
    expect(entry.attempts).toBe(2)
    expect(Status.matchOrElse(entry.status, { Uploading: ({ attempt }) => attempt }, () => 0)).toBe(
      2,
    )
  })

  it('does not retry what is not retryable or not failed', () => {
    const model = sending()
    const unretryable = update(
      model,
      Message.Failed({ id: 'local-1', attempt: 1, reason: 'too big', retryable: false }),
    ).model
    expect(update(unretryable, Message.Retried({ id: 'local-1' })).model).toBe(unretryable)
    expect(update(model, Message.Retried({ id: 'local-1' })).model).toBe(model)
    expect(update(model, Message.Retried({ id: 'nope' })).model).toBe(model)
  })

  it('removing an uploading file frees its lane for the next queued one', () => {
    const model = sending()
    const { model: after, outMessage } = update(model, Message.Removed({ id: 'local-1' }))
    expect(names(after)).not.toContain('a.txt')
    expect(statusOf(after, 'local-4')).toBe('Uploading 0')
    expect(outMessage).toMatchObject({ _tag: 'Removed', ids: ['local-1'] })
  })

  describe('answers of another attempt or entry', () => {
    const model = sending()
    const staleMessages = [
      Message.Progressed({ id: 'local-1', attempt: 2, loaded: 1, total: 10 }),
      Message.Succeeded({ id: 'local-1', attempt: 2, url: Option.none() }),
      Message.Failed({ id: 'local-1', attempt: 2, reason: 'x', retryable: true }),
      Message.Progressed({ id: 'gone', attempt: 1, loaded: 1, total: 10 }),
      Message.Succeeded({ id: 'local-4', attempt: 1, url: Option.none() }),
    ]
    it.each(staleMessages.map(stale => [stale._tag, stale] as const))(
      'a stale %s changes nothing',
      (_, stale) => {
        expect(update(model, stale).model).toBe(model)
      },
    )
  })

  it('progress moves the entry only, and a repeat is no change', () => {
    const model = sending()
    const moved = update(
      model,
      Message.Progressed({ id: 'local-1', attempt: 1, loaded: 4, total: 10 }),
    ).model
    expect(
      Status.matchOrElse(moved.entries[0]!.status, { Uploading: ({ loaded }) => loaded }, () => -1),
    ).toBe(4)
    expect(moved.entries[1]).toBe(model.entries[1])
    expect(
      update(moved, Message.Progressed({ id: 'local-1', attempt: 1, loaded: 4, total: 10 })).model,
    ).toBe(moved)
  })

  it('says what finished and what failed', () => {
    const model = sending()
    const done = update(
      model,
      Message.Succeeded({ id: 'local-1', attempt: 1, url: Option.none() }),
    ).model
    expect(done.notice).toEqual(Option.some({ _tag: 'Uploaded', name: 'a.txt' }))
    const failed = update(
      model,
      Message.Failed({ id: 'local-2', attempt: 1, reason: 'offline', retryable: true }),
    ).model
    expect(failed.notice).toEqual(Option.some({ _tag: 'Failed', name: 'b.txt', reason: 'offline' }))
  })

  it('counts what the entries are doing', () => {
    const model = sending()
    expect(FileUpload.counts(model)).toEqual({
      held: 0,
      queued: 2,
      uploading: 3,
      done: 0,
      failed: 0,
      bytes: 50,
    })
  })
})

describe('FileUpload.update, removing', () => {
  const three = () =>
    offered(init({ id: 'up', multiple: true }), [make('a.txt'), make('b.txt'), make('c.txt')]).model
  const focusOf = (
    commands: ReadonlyArray<{ readonly name: string; readonly args?: unknown }> | undefined,
  ) => (commands ?? []).find(command => command.name === 'FileUpload.Focus')?.args

  it("puts focus on the next entry's remove button, else the previous, else the input", () => {
    const model = three()
    expect(focusOf(update(model, Message.Removed({ id: 'local-2' })).commands)).toEqual({
      id: FileUpload.removeId('up', 'local-3'),
    })
    expect(focusOf(update(model, Message.Removed({ id: 'local-3' })).commands)).toEqual({
      id: FileUpload.removeId('up', 'local-2'),
    })
    const one = offered(init({ id: 'up' }), [make('a.txt')]).model
    expect(focusOf(update(one, Message.Removed({ id: 'local-1' })).commands)).toEqual({
      id: 'up-input',
    })
  })

  it('writes the remaining files back and revokes the removed preview', () => {
    const image = make('a.png', { type: 'image/png' })
    const model = update(
      offered(init({ id: 'up', multiple: true }), [image, make('b.txt')]).model,
      Message.Previewed({ previews: [{ id: 'local-1', url: 'blob:a' }] }),
    ).model
    const { commands } = update(model, Message.Removed({ id: 'local-1' }))
    expect(commandNames(commands)).toEqual([
      'FileInput.Sync',
      'FileUpload.Revoke',
      'FileUpload.Focus',
    ])
    const revoke = (commands ?? []).find(command => command.name === 'FileUpload.Revoke')
    expect(revoke?.args).toEqual({ urls: ['blob:a'] })
  })

  it('removing a stored file writes nothing into the input', () => {
    const model = init({
      id: 'up',
      multiple: true,
      initial: [{ id: 's', name: 's.png', size: 1, type: 'image/png', url: '/s.png' }],
    })
    expect(commandNames(update(model, Message.Removed({ id: 's' })).commands)).toEqual([
      'FileUpload.Focus',
    ])
  })

  it('RemovedLast takes the last entry and focuses the input', () => {
    const { model, commands } = update(three(), Message.RemovedLast())
    expect(names(model)).toEqual(['a.txt', 'b.txt'])
    expect(focusOf(commands)).toEqual({ id: 'up-input' })
  })

  it('Cleared removes all and focuses the input', () => {
    const { model, commands, outMessage } = update(three(), Message.Cleared())
    expect(model.entries).toEqual([])
    expect(focusOf(commands)).toEqual({ id: 'up-input' })
    expect(outMessage).toMatchObject({ _tag: 'Removed', ids: ['local-1', 'local-2', 'local-3'] })
    expect(model.notice).toEqual(Option.some({ _tag: 'Cleared', count: 3 }))
  })

  it('without removes what the application dropped and moves no focus', () => {
    const { model, commands } = FileUpload.without(three(), ['local-1', 'local-3'])
    expect(names(model)).toEqual(['b.txt'])
    expect(commandNames(commands)).toEqual(['FileInput.Sync'])
  })
})

describe('FileUpload.update, previews', () => {
  it('lists a preview on its entry', () => {
    const model = offered(init({ id: 'up' }), [make('a.png', { type: 'image/png' })]).model
    const previewed = update(
      model,
      Message.Previewed({ previews: [{ id: 'local-1', url: 'blob:a' }] }),
    )
    expect(previewed.model.entries[0]?.preview).toEqual(Option.some('blob:a'))
    expect(previewed.commands).toEqual([])
    expect(FileUpload.displayUrl(previewed.model.entries[0]!)).toEqual(Option.some('blob:a'))
  })

  it('revokes the URL of an entry removed before the Command answered', () => {
    const model = offered(init({ id: 'up' }), [make('a.png', { type: 'image/png' })]).model
    const removed = update(model, Message.Removed({ id: 'local-1' })).model
    const { model: after, commands } = update(
      removed,
      Message.Previewed({ previews: [{ id: 'local-1', url: 'blob:late' }] }),
    )
    expect(after).toBe(removed)
    expect(commands?.map(command => command.args)).toEqual([{ urls: ['blob:late'] }])
  })

  it('shows a stored image by its own address, and a stored document by none', () => {
    const model = init({
      id: 'up',
      multiple: true,
      initial: [
        { id: 'i', name: 'i.png', size: 1, type: 'image/png', url: '/i.png' },
        { id: 'd', name: 'd.pdf', size: 1, type: 'application/pdf', url: '/d.pdf' },
      ],
    })
    expect(model.entries.map(FileUpload.displayUrl)).toEqual([Option.some('/i.png'), Option.none()])
  })

  it('released clears every preview and revokes them in one Command', () => {
    const base = offered(init({ id: 'up', multiple: true }), [
      make('a.png', { type: 'image/png' }),
      make('b.png', { type: 'image/png' }),
    ]).model
    const model = update(
      base,
      Message.Previewed({
        previews: [
          { id: 'local-1', url: 'blob:a' },
          { id: 'local-2', url: 'blob:b' },
        ],
      }),
    ).model
    const { model: after, commands } = FileUpload.released(model)
    expect(after.entries.map(entry => entry.preview)).toEqual([Option.none(), Option.none()])
    expect(commands?.map(command => command.args)).toEqual([{ urls: ['blob:a', 'blob:b'] }])
    expect(FileUpload.released(after).model).toBe(after)
  })
})

describe('FileUpload.update, the rest', () => {
  const model = offered(init({ id: 'up', multiple: true }), [make('a.txt'), make('b.txt')]).model

  it('drags in and out, and a repeat is no change', () => {
    const entered = update(model, Message.DragEntered()).model
    expect(entered.dragging).toBe(true)
    expect(update(entered, Message.DragEntered()).model).toBe(entered)
    expect(update(entered, Message.DragLeft()).model.dragging).toBe(false)
    expect(update(model, Message.DragLeft()).model).toBe(model)
  })

  it('answers of Commands change nothing', () => {
    for (const done of [
      Message.CompletedSync(),
      Message.CompletedFocus(),
      Message.CompletedRevoke(),
    ]) {
      expect(update(model, done).model).toBe(model)
    }
  })

  it('removing, retrying or previewing what is not there is no change', () => {
    expect(update(model, Message.Removed({ id: 'nope' })).model).toBe(model)
    expect(update(init({ id: 'up' }), Message.RemovedLast()).model.entries).toEqual([])
    const empty = init({ id: 'up' })
    expect(update(empty, Message.RemovedLast()).model).toBe(empty)
    expect(update(empty, Message.Cleared()).model).toBe(empty)
    expect(update(model, Message.Previewed({ previews: [] })).model).toBe(model)
  })

  it('dismisses refusals, and does nothing when there are none', () => {
    const refused = offered(init({ id: 'up', maxSize: 1 }), [make('big.txt', { size: 9 })]).model
    expect(refused.refusals).toHaveLength(1)
    expect(update(refused, Message.DismissedRefusals()).model.refusals).toEqual([])
    expect(update(model, Message.DismissedRefusals()).model).toBe(model)
  })
})

describe('FileUpload helpers', () => {
  const model = offered(init({ id: 'up', multiple: true }), [
    make('a.txt'),
    make('b.txt'),
    make('c.txt'),
  ]).model

  it('lists the ids in drawn order', () => {
    expect(FileUpload.ids(model)).toEqual(['local-1', 'local-2', 'local-3'])
  })

  it('ordered follows the ids given, keeps what they lack at the end and is the same Model when unchanged', () => {
    expect(names(FileUpload.ordered(model, ['local-3', 'local-1', 'local-2']))).toEqual([
      'c.txt',
      'a.txt',
      'b.txt',
    ])
    expect(names(FileUpload.ordered(model, ['local-2', 'nope']))).toEqual([
      'b.txt',
      'a.txt',
      'c.txt',
    ])
    expect(FileUpload.ordered(model, FileUpload.ids(model))).toBe(model)
    expect(FileUpload.ordered(model, [])).toBe(model)
  })

  it('announce sets what the live region says', () => {
    expect(FileUpload.announce(model, 'Moved a.txt').notice).toEqual(
      Option.some({ _tag: 'Said', text: 'Moved a.txt' }),
    )
  })

  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1536, '1.5 kB'],
    [1234567, '1.2 MB'],
  ])('writes %i bytes as %s', (bytes, text) => {
    expect(FileUpload.sizeText(bytes)).toBe(text)
  })
})

describe('FileUpload.settled', () => {
  it('keeps uploaded files as stored ones and drops the rest, as JSON', () => {
    const base = offered(init({ id: 'up', multiple: true, lanes: 2 }), [
      make('done.png', { type: 'image/png' }),
      make('lost.txt'),
      make('queued.txt'),
    ]).model
    const done = update(
      base,
      Message.Succeeded({ id: 'local-1', attempt: 1, url: Option.some('/files/done.png') }),
    ).model
    const dragging = update(done, Message.DragEntered()).model
    const settled = FileUpload.settled(dragging)
    expect(settled.entries.map(entry => entry.name)).toEqual(['done.png'])
    expect(settled.entries[0]?.source).toEqual({ _tag: 'Stored', url: '/files/done.png' })
    expect(statusOf(settled, 'local-1')).toBe('Held')
    expect(settled.dragging).toBe(false)
    expect(settled.refusals).toEqual([])
    expect(settled.notice).toEqual(Option.none())
    const wire = JSON.parse(JSON.stringify(Schema.encodeSync(FileUpload.Model)(settled)))
    expect(Schema.decodeUnknownSync(FileUpload.Model)(wire)).toEqual(settled)
  })

  it('drops an uploaded file that reported no address', () => {
    const base = offered(init({ id: 'up', lanes: 1 }), [make('a.txt')]).model
    const done = update(
      base,
      Message.Succeeded({ id: 'local-1', attempt: 1, url: Option.none() }),
    ).model
    expect(FileUpload.settled(done).entries).toEqual([])
  })
})

describe('FileUpload Files in the Model', () => {
  it('holds the very File it was offered', () => {
    const file = make('a.txt')
    const { model } = offered(init({ id: 'up' }), [file])
    const held = FileUpload.Source.matchOrElse(
      model.entries[0]!.source,
      { Local: source => source.file },
      () => undefined,
    )
    expect(held).toBe(file)
  })
})
