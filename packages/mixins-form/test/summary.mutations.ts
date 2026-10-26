/**
 * The form's list of fields to fix, broken in turn: `pnpm mutate packages/mixins-form/test/summary.mutations.ts`.
 */
const file = '../src/index.ts'
const unit = 'packages/mixins-form/test/summary.test.ts'
const browser = 'packages/mixins-form/test/summary.browser.test.ts'

export default [
  {
    name: 'no invalid field is listed',
    edits: [
      {
        file,
        find: 'if (FieldValidation.isInvalid(state))\n                  issues.push({',
        replace: 'if (false)\n                  issues.push({',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a link goes nowhere without scripts',
    edits: [{ file, find: 'h.Href(`#${issue.id}`)', replace: "h.Href('#')" }],
    tests: [unit],
  },
  {
    name: 'the summary is not in the form’s words',
    edits: [
      {
        file,
        find: "input.words?.summary ?? 'Check these fields:'",
        replace: "'Check these fields:'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a link’s words are not the form’s',
    edits: [
      {
        file,
        find: "input.words?.issue ?? '{label}: {error}'",
        replace: "'{label}: {error}'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the list of links is outside a Slot',
    edits: [{ file, find: 'slots.issues.attrs()', replace: '[]' }],
    tests: [unit],
  },
  {
    name: 'a press moves no focus',
    edits: [{ file, find: 'focusSelector: controlAt(issue.id),', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a press navigates',
    edits: [{ file, find: "defaultAction: 'Prevent',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'a group’s link focuses only the group',
    edits: [
      { file, find: 'return `${at}${control}, ${at} ${control}`', replace: 'return `${at}`' },
    ],
    tests: [browser],
  },
]
