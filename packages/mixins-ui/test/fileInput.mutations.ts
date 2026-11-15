/**
 * The file input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fileInput.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/fileInput.test.ts'
const browser = 'packages/mixins-ui/test/fileInput.browser.test.ts'
const ssr = 'packages/mixins-ui/test/fileInput.ssr.test.ts'
const source = '../src/fileInput.ts'
const recipe = '../src/recipes/fileInput.ts'

export default [
  {
    name: 'the input is a text box, not a file picker',
    edits: [{ file: source, find: "h.Type('file'),", replace: "h.Type('text')," }],
    tests: [unit, ssr, browser],
  },
  {
    name: 'the trigger is not the input label',
    edits: [{ file: source, find: 'h.For(inputId(options.id)), ', replace: '' }],
    tests: [unit, ssr, browser],
  },
  {
    name: 'the field drops its name',
    edits: [
      {
        file: source,
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests: [unit, ssr, browser],
  },
  {
    name: 'the kinds are not passed on',
    edits: [
      {
        file: source,
        find: '...(options.accept === undefined ? [] : [h.Accept(options.accept)]),',
        replace: '',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'the field is never multiple',
    edits: [
      {
        file: source,
        find: '...(options.multiple === true ? [h.Multiple(true)] : []),',
        replace: '',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'the field is never required',
    edits: [
      {
        file: source,
        find: '...(options.required === true ? [h.Required(true)] : []),',
        replace: '',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'the field never says it is invalid',
    edits: [
      {
        file: source,
        find: '...(options.invalid === true ? [h.AriaInvalid(true)] : []),',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the description is not tied to the input',
    edits: [
      {
        file: source,
        find: '...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),',
        replace: '',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'a disabled field still takes a pick',
    edits: [
      {
        file: source,
        find: '...(disabled ? [h.Disabled(true)] : [h.OnFileChange(options.onChange)]),',
        replace: '...[h.OnFileChange(options.onChange)],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a disabled field does not mark itself, so it looks on',
    edits: [
      {
        file: source,
        find: "...(disabled ? [h.DataAttribute('disabled', '')] : []),",
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a disabled row can still be removed',
    edits: [
      {
        file: source,
        find: '...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onRemove(file))]),',
        replace: '...[h.OnClick(options.onRemove(file))],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a remove button sends the first file, not its own',
    edits: [
      {
        file: source,
        find: 'h.OnClick(options.onRemove(file))',
        replace: 'h.OnClick(options.onRemove(options.files[0]!))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a remove button sends nothing',
    edits: [
      {
        file: source,
        find: '...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onRemove(file))]),',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a remove button has no name',
    edits: [
      {
        file: source,
        find: "h.AriaLabel(removeWords.replace('{name}', file.name)),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the words given for remove are ignored',
    edits: [
      {
        file: source,
        find: "options.words?.remove ?? 'Remove {name}'",
        replace: "'Remove {name}'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'an empty list still draws a list',
    edits: [{ file: source, find: 'options.files.length === 0', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'the list is not written back into the input',
    edits: [{ file: source, find: 'input.files = transfer.files', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the list is written into another field',
    edits: [
      {
        file: source,
        find: 'const input = document.getElementById(inputId(id))',
        replace: 'const input = document.getElementById(`${id}-other`)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'focus goes to another element',
    edits: [
      {
        file: source,
        find: 'Dom.focus(`#${inputId(id)}`)',
        replace: 'Dom.focus(`#${id}-clear`)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a single field keeps the old file',
    edits: [
      {
        file: source,
        find: 'return picked.length === 0 ? files : picked.slice(0, 1)',
        replace: 'return files.length === 0 ? picked.slice(0, 1) : files',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a cancelled dialog empties a single field',
    edits: [
      {
        file: source,
        find: 'return picked.length === 0 ? files : picked.slice(0, 1)',
        replace: 'return picked.slice(0, 1)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a single field takes every file of the pick',
    edits: [
      {
        file: source,
        find: 'return picked.length === 0 ? files : picked.slice(0, 1)',
        replace: 'return picked.length === 0 ? files : picked',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a multiple field adds a file it already holds',
    edits: [
      {
        file: source,
        find: 'if (held.has(key)) return false',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a multiple field adds a file twice from one pick',
    edits: [
      {
        file: source,
        find: 'held.add(key)\n      return true',
        replace: 'return true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a file is the same when only its time differs',
    edits: [
      {
        file: source,
        find: '${file.name}:${file.size}:${file.lastModified}:${file.type}',
        replace: '${file.name}:${file.size}:${file.type}',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a multiple field replaces the list',
    edits: [{ file: source, find: '...files,\n    ...picked.filter', replace: '...picked.filter' }],
    tests: [unit, browser],
  },
  {
    name: 'the input is drawn',
    edits: [{ file: recipe, find: "opacity: '0',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the trigger does not ring on keyboard focus',
    edits: [{ file: recipe, find: "'input:focus-visible + &'", replace: "'input:hover + &'" }],
    tests: [browser],
  },
  {
    name: 'a disabled trigger keeps its cursor',
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
    name: 'an invalid trigger keeps its border',
    edits: [
      {
        file: recipe,
        find: "variant(Style.pseudo('[data-invalid]', { borderColor: ref.error.outline })),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the size steps nothing',
    edits: [{ file: recipe, find: 'sm: { root: steps.sm },', replace: 'sm: { root: steps.md },' }],
    tests: [browser],
  },
  {
    name: 'the spread cases lack the answer of Focus',
    edits: [{ file: source, find: 'CompletedFocus: {},', replace: '' }],
    tests: [unit],
  },
]
