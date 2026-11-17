/**
 * The file upload, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fileUpload.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/fileUpload.test.ts'
const source = '../src/fileUpload.ts'

export default [
  {
    name: 'a file of another kind is listed',
    edits: [
      {
        file: source,
        find: 'if (!accepts(model.accept, file)) return',
        replace: 'if (false) return',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a file over maxSize is listed',
    edits: [{ file: source, find: 'file.size > max', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'a file already listed is listed again',
    edits: [{ file: source, find: 'return held.has(key) ?', replace: 'return false ?' }],
    tests: [unit],
  },
  {
    name: 'a batch past maxFiles is listed',
    edits: [{ file: source, find: 'fresh.length > available', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'a size is judged before the kind',
    edits: [
      {
        file: source,
        find: 'if (!accepts(model.accept, file)) return Option.some(Refusal.Kind({ name: file.name }))\n  return Option.flatMap(model.maxSize,',
        replace:
          'if (!accepts(model.accept, file) && Option.isNone(model.maxSize)) return Option.some(Refusal.Kind({ name: file.name }))\n  return Option.flatMap(model.maxSize,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a stale attempt is applied',
    edits: [
      {
        file: source,
        find: 'uploading => uploading.attempt === attempt',
        replace: 'uploading => uploading.attempt !== attempt',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a replaced preview is not revoked',
    edits: [{ file: source, find: '...revoke(previewsOf(replacing)),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a removed preview is not revoked',
    edits: [{ file: source, find: '...revoke(previewsOf(leaving)),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'an offer does not write the files into the input',
    edits: [
      {
        file: source,
        find: '...sync(next, model.entries),\n      ...(previewing.length',
        replace: '...(previewing.length',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal does not write the files into the input',
    edits: [
      {
        file: source,
        find: 'commands: [...sync(next, model.entries), ...revoke(previewsOf(leaving)),',
        replace: 'commands: [...revoke(previewsOf(leaving)),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'promotion ignores the lane count',
    edits: [{ file: source, find: 'lane < lanes; lane += 1', replace: 'lane < 99; lane += 1' }],
    tests: [unit],
  },
  {
    name: 'promotion gives a busy lane to a second entry',
    edits: [{ file: source, find: 'if (busy.has(lane)) continue', replace: '' }],
    tests: [unit],
  },
  {
    name: 'files are held for a field with lanes',
    edits: [
      {
        file: source,
        find: 'model.lanes === 0 ? Status.Held() : Status.Queued()',
        replace: 'Status.Held()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a field with no lanes queues files',
    edits: [
      {
        file: source,
        find: 'model.lanes === 0 ? Status.Held() : Status.Queued()',
        replace: 'Status.Queued()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'focus has no fallback to the previous entry',
    edits: [
      { file: source, find: 'const target = after ?? before', replace: 'const target = after' },
    ],
    tests: [unit],
  },
  {
    name: 'a retry of a file that cannot be retried goes ahead',
    edits: [{ file: source, find: 'if (!retryable) return { model }', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a late preview is not revoked',
    edits: [
      {
        file: source,
        find: 'commands: revoke(late.map(preview => preview.url)),',
        replace: 'commands: [],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'previews are asked for when the field has none',
    edits: [
      {
        file: source,
        find: 'const previewing = model.previews',
        replace: 'const previewing = true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a single field keeps the old entry beside the new one',
    edits: [
      {
        file: source,
        find: 'const replacing = !model.multiple && fresh.length > 0 ? model.entries : []',
        replace: 'const replacing = []',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a repeated drag-enter is a new Model',
    edits: [
      {
        file: source,
        find: 'model.dragging ? { model } : { model: modifyFields(model, { dragging: () => true }) }',
        replace: '{ model: modifyFields(model, { dragging: () => true }) }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'settled keeps a file that was never uploaded',
    edits: [
      {
        file: source,
        find: 'onNone: () => [],\n                    onSome: stored',
        replace: 'onNone: () => [entry],\n                    onSome: stored',
      },
    ],
    tests: [unit],
  },
]
