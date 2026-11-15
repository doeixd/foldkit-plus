/**
 * The focus-kept section, broken in turn: `pnpm mutate
 * examples/widgets/test/focus-kept.mutations.ts`.
 */
const app = '../src/focus-kept/app.ts'
const view = '../src/focus-kept/view.ts'
const unit = ['examples/widgets/test/focus-kept.test.ts']
const browser = ['examples/widgets/test/focus-kept.browser.test.ts']

export default [
  {
    name: 'a dismissed alert stays in the list',
    edits: [
      {
        file: app,
        find: 'const alerts = without(model.alerts, id)',
        replace: 'const alerts = model.alerts',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a dismissal of an id that is not there rewrites the list',
    edits: [
      {
        file: app,
        find: 'return kept.length === notices.length ? notices : kept',
        replace: 'return kept',
      },
    ],
    tests: unit,
  },
  {
    name: 'an added alert takes the id of the length, which a dismissal frees',
    edits: [
      {
        file: app,
        find: 'id: `alert-${model.alertsMade + 1}`',
        replace: 'id: `alert-${model.alerts.length + 1}`',
      },
    ],
    tests: unit,
  },
  {
    name: 'the toasts shown are not counted',
    edits: [{ file: app, find: 'counted ? shown + 1 : shown', replace: 'shown' }],
    tests: unit,
  },
  {
    name: 'the alert’s dismiss button is no part',
    edits: [
      {
        file: view,
        find: "onDismiss: Message.DismissedAlert({ id: notice.id }),\n              recoveryPart: 'dismiss',",
        replace: 'onDismiss: Message.DismissedAlert({ id: notice.id }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the card’s dismiss button is no part',
    edits: [
      {
        file: view,
        find: "always: true },\n              recoveryPart: 'dismiss',",
        replace: 'always: true },',
      },
    ],
    tests: browser,
  },
  {
    name: 'focus never goes to the previous row',
    edits: [
      {
        file: view,
        find: "dismiss: ['next', 'previous', { part: 'add' }]",
        replace: "dismiss: ['next', { part: 'add' }]",
      },
    ],
    tests: browser,
  },
  {
    name: 'focus never falls back to Add',
    edits: [
      {
        file: view,
        find: "dismiss: ['next', 'previous', { part: 'add' }]",
        replace: "dismiss: ['next', 'previous']",
      },
    ],
    tests: browser,
  },
  {
    name: 'Add is no part, so nothing can be named as the fallback',
    edits: [{ file: view, find: ', add: [] }', replace: ' }' }],
    tests: browser,
  },
  {
    name: 'one owner holds both lists',
    edits: [{ file: view, find: "owner: 'group',", replace: "owner: 'root'," }],
    tests: browser,
  },
  {
    name: 'the toast stack keeps no focus',
    edits: [{ file: view, find: '          mixins: Toast.keepFocus,\n', replace: '' }],
    tests: browser,
  },
]
