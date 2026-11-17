/**
 * The file upload, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fileUpload.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/fileUpload.test.ts'
const examples = 'packages/mixins-ui/test/fileUpload.examples.browser.test.ts'
const view = 'packages/mixins-ui/test/fileUpload.view.test.ts'
const browser = 'packages/mixins-ui/test/fileUpload.browser.test.ts'
const ssr = 'packages/mixins-ui/test/fileUpload.ssr.test.ts'
const source = '../src/fileUpload.ts'
const recipe = '../src/recipes/fileUpload.ts'

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
    name: 'a picked offer does not write the files back into the input',
    edits: [
      {
        file: source,
        find: "...(by === 'pick' ? writeFiles(next) : sync(next, model.entries)),",
        replace: "...(by === 'pick' ? [] : sync(next, model.entries)),",
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
  {
    name: 'the Open route is deleted, so Enter is free for a route',
    edits: [
      {
        file: source,
        find: "on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(' ')],",
        replace: 'on: [],',
      },
    ],
    tests: [view, browser],
  },
  {
    name: 'the picker is not the input label',
    edits: [{ file: source, find: 'h.For(inputId),', replace: '' }],
    tests: [view, ssr, browser],
  },
  {
    name: 'the input takes no pick',
    edits: [
      {
        file: source,
        find: "h.OnFileChange(files => lift(Message.Offered({ files, by: 'pick' }))),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a drop is not answered',
    edits: [
      {
        file: source,
        find: "h.OnDropFiles(files => lift(Message.Offered({ files, by: 'drop' }))),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the limits are not passed to the input as kinds',
    edits: [{ file: source, find: "h.Accept(model.accept.join(','))", replace: "h.Accept('')" }],
    tests: [view, ssr],
  },
  {
    name: 'the status region is not a status',
    edits: [{ file: source, find: ", h.Role('status')]", replace: ']' }],
    tests: [view, ssr],
  },
  {
    name: 'the input does not point at the errors',
    edits: [
      {
        file: source,
        find: '...(model.refusals.length === 0 ? [] : [idOf.errors]),',
        replace: '',
      },
    ],
    tests: [view],
  },
  {
    name: 'a disabled field leaves its input enabled',
    edits: [{ file: source, find: '...(disabled ? [h.Disabled(true)] : []),', replace: '' }],
    tests: [view, browser],
  },
  {
    name: 'a read-only input stays in the tab order',
    edits: [{ file: source, find: '...(readOnly ? [h.Tabindex(-1)] : []),', replace: '' }],
    tests: [view],
  },
  {
    name: 'a read-only field draws a picker',
    edits: [{ file: source, find: 'const picker = readOnly', replace: 'const picker = false' }],
    tests: [view],
  },
  {
    name: 'a cancel button is named Remove',
    edits: [
      { file: source, find: 'cancelling ? text.cancel : text.remove', replace: 'text.remove' },
    ],
    tests: [view],
  },
  {
    name: 'a failure that cannot be retried offers Try again',
    edits: [
      { file: source, find: 'Failed: failed => failed.retryable', replace: 'Failed: () => true' },
    ],
    tests: [view],
  },
  {
    name: 'only a queued entry draws a progress bar',
    edits: [
      {
        file: source,
        find: 'Uploading: () =>\n            Option.some(\n              h.div(builders.progress',
        replace: 'Queued: () =>\n            Option.some(\n              h.div(builders.progress',
      },
    ],
    tests: [view],
  },
  {
    name: 'grips are drawn without sort',
    edits: [
      {
        file: source,
        find: 'options.sort === undefined || disabled || readOnly',
        replace: 'disabled || readOnly',
      },
    ],
    tests: [view],
  },
  {
    name: 'a field with a picture still draws the list',
    edits: [
      {
        file: source,
        find: 'options.picture !== undefined || drawn.items.length === 0',
        replace: 'drawn.items.length === 0',
      },
    ],
    tests: [view],
  },
  {
    name: 'a single field draws a summary',
    edits: [
      {
        file: source,
        find: 'model.multiple && model.entries.length > 0 && options.picture === undefined',
        replace: 'model.entries.length > 0 && options.picture === undefined',
      },
    ],
    tests: [view],
  },
  {
    name: 'the dragging mark is never set',
    edits: [
      {
        file: source,
        find: "...(model.dragging ? [h.DataAttribute('dragging', '')] : []),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a zone does not answer a drag',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-dragging]', {\n            borderColor: ref.accent.default,\n            backgroundColor: ref.accent.subtle,\n          }),\n          Style.pseudo('[data-dragging]:hover', {",
        replace: "Style.pseudo('[data-dragging]:hover', {",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a disabled picker keeps its cursor',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-disabled]', { cursor: 'not-allowed' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the picture is not veiled on hover',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(':hover', { '--_fk-upload-veil': '1' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the picture is not veiled on keyboard focus',
    edits: [
      {
        file: recipe,
        find: "Style.nest('input:focus-visible + &', { '--_fk-upload-veil': '1' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the picker does not ring on keyboard focus',
    edits: [
      {
        file: recipe,
        find: "'input:focus-visible + &', {\n        outline",
        replace: "'input:hover + &', {\n        outline",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an invalid button keeps its border',
    edits: [
      {
        file: recipe,
        find: "Style.nest(':where([data-invalid]) > &', { borderColor: ref.error.outline }),\n            Style.pseudo('[data-dragging]', { borderColor: ref.accent.default }),",
        replace: "Style.pseudo('[data-dragging]', { borderColor: ref.accent.default }),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the grid is one column',
    edits: [
      {
        file: recipe,
        find: "gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))',",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "every lane reads the first lane's job",
    edits: [
      {
        file: source,
        find: 'Option.contains(laneOf(entry), lane)',
        replace: 'Option.contains(laneOf(entry), 0)',
      },
    ],
    tests: [examples],
  },
  {
    name: 'a grip loses focus when its file moves',
    edits: [{ file: '../src/fileUpload/sort.ts', find: "grip: ['same'],", replace: '' }],
    tests: [examples],
  },
  {
    name: 'the progress label is drawn for sighted readers',
    edits: [{ file: '../src/fileUpload/progress.ts', find: "inlineSize: '1px',", replace: '' }],
    tests: [examples],
  },
  {
    name: 'a removed preview is not revoked, seen in the page',
    edits: [{ file: source, find: '...revoke(previewsOf(leaving)),', replace: '' }],
    tests: [examples],
  },
  {
    name: 'the zone is the heavy muted slab again',
    edits: [
      {
        file: recipe,
        find: 'backgroundColor: zoneGround,\n            color: ref.text.default,',
        replace: 'backgroundColor: ref.surface.muted,\n            color: ref.text.default,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a hover does not firm the zone outline',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(':hover', { borderColor: ref.outline.overt }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an invalid zone loses its error outline when hovered',
    edits: [
      {
        file: recipe,
        find: "Style.nest(':where([data-invalid]) > &:hover', { borderColor: ref.error.outline }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the prompt keeps its muted colour under a drag',
    edits: [
      {
        file: recipe,
        find: "prompt: variant(Style.nest(':where([data-dragging]) > &', { color: ref.accent.ink })),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'browse is always underlined',
    edits: [
      {
        file: recipe,
        find: "textDecorationLine: 'none',",
        replace: "textDecorationLine: 'underline',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'browse is the default link blue',
    edits: [{ file: recipe, find: 'color: ref.text.link,', replace: "color: 'LinkText'," }],
    tests: [browser],
  },
  {
    name: 'the remove chip is a circle',
    edits: [
      {
        file: recipe,
        find: `remove: variant(
          Style.self({ borderRadius: chipCorner(ref.space.xs) }),
          Style.pseudo('[type="button"]', chipBox),
        ),
      },
    },
    size`,
        replace: `remove: variant(
          Style.self({ borderRadius: ref.radius.full }),
          Style.pseudo('[type="button"]', chipBox),
        ),
      },
    },
    size`,
      },
    ],
    tests: [browser],
  },
  {
    name: 'the grid chip is always shown',
    edits: [
      { file: recipe, find: "'--_fk-upload-chip': '0',", replace: "'--_fk-upload-chip': '1'," },
    ],
    tests: [browser],
  },
  {
    name: 'a non-image shows no extension',
    edits: [{ file: source, find: '[extensionOf(entry.name)]', replace: '[]' }],
    tests: [browser],
  },
  {
    name: 'the size is left-aligned',
    edits: [
      {
        file: recipe,
        find: "textAlign: 'end',\n        fontVariantNumeric",
        replace: "textAlign: 'start',\n        fontVariantNumeric",
      },
    ],
    tests: [browser],
  },
]
