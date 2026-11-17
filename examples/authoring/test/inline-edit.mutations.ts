/**
 * The inline-edit section, broken in turn: `pnpm mutate
 * examples/authoring/test/inline-edit.mutations.ts`.
 */
const app = '../src/inline-edit/app.ts'
const view = '../src/inline-edit/view.ts'
const unit = 'examples/authoring/test/inline-edit.test.ts'
const page = 'examples/authoring/test/inline-edit.browser.test.ts'

export default [
  {
    name: 'a blank title is allowed',
    edits: [
      { file: app, find: "if (wanted === '') return", replace: "if (wanted === 'blank!') return" },
    ],
    tests: [unit],
  },
  {
    name: 'a duplicate title is allowed',
    edits: [
      {
        file: app,
        find: 'Array.some(titles, title =>',
        replace: 'Array.some([], (title: Title) =>',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a title counts as a duplicate of itself',
    edits: [{ file: app, find: 'title.id !== id && ', replace: '' }],
    tests: [unit],
  },
  {
    name: 'duplicates are compared case-sensitively',
    edits: [
      {
        file: app,
        find: 'title.text.toLowerCase() === wanted',
        replace: 'title.text === value.trim()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refusal closes the editor instead of keeping it open',
    edits: [
      {
        file: app,
        find: 'onSome: reason => Renames.helpers.refuse(committed, reason)(model),',
        replace: 'onSome: () => ({ model }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an accepted title is stored untrimmed',
    edits: [{ file: app, find: 'text: committed.value.trim()', replace: 'text: committed.value' }],
    tests: [unit],
  },
  {
    name: 'focus does not return to the title after the field closes',
    edits: [
      {
        file: '../../../packages/primitives/src/interaction/inline-edit.ts',
        find: 'document.getElementById(displayId(args, id))?.focus()',
        replace: 'void 0',
      },
    ],
    tests: [page],
  },
  {
    name: 'the reason is not drawn',
    edits: [
      {
        file: view,
        find: 'onSome: reason => [h.p(slots.error.attrs(), [reason])],',
        replace: 'onSome: () => [],',
      },
    ],
    tests: [page],
  },
  {
    name: 'the field is not wired to InlineEdit',
    edits: [{ file: view, find: 'Behavior.attach(Renames), ', replace: '' }],
    tests: [page],
  },
]
