/**
 * When a key's failure shows (#192), broken in turn:
 * `pnpm mutate packages/form/test/timing.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/form.test.ts']

export default [
  {
    name: 'a blur validates the key it left, as it did before #192',
    edits: [
      {
        file,
        find: `          case 'Blurred':
          case 'FollowedIssue':`,
        replace: `          case 'Blurred':
            return validateKey(model, message.key, drafts(model)[message.key].value)
          case 'FollowedIssue':`,
      },
    ],
    tests,
  },
  {
    name: 'a blur validates the key it left, in a real browser',
    edits: [
      {
        file,
        find: `          case 'Blurred':
          case 'FollowedIssue':`,
        replace: `          case 'Blurred':
            return validateKey(model, message.key, drafts(model)[message.key].value)
          case 'FollowedIssue':`,
      },
    ],
    tests: ['examples/cloudflare/test/addForm.browser.test.ts'],
  },
  {
    name: 'Validated changes nothing',
    edits: [
      {
        file,
        find: `          case 'Validated': {
            const state = drafts(model)[message.key]`,
        replace: `          case 'Validated': {
            return { model }
            const state = drafts(model)[message.key]`,
      },
    ],
    tests,
  },
  {
    name: 'a submit does not record the attempt',
    edits: [
      {
        file,
        find: `          submitPending: false,
          attempted: true,
        },`,
        replace: `          submitPending: false,
        },`,
      },
    ],
    tests,
  },
  {
    name: 'a reset keeps the attempt',
    edits: [
      {
        file,
        find: 'return { model: { ...initial, subject: model.subject } }',
        replace:
          'return { model: { ...initial, subject: model.subject, attempted: model.attempted } }',
      },
    ],
    tests,
  },
  {
    name: 'a fill keeps the attempt',
    edits: [
      {
        file,
        find: `        // Another value to edit, with nothing submitted yet.
        attempted: false,`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an edit forgets the attempt',
    edits: [
      {
        file,
        find: `      marks: {},
      submitPending: false,
    })`,
        replace: `      marks: {},
      submitPending: false,
      attempted: false,
    })`,
      },
    ],
    tests,
  },
  {
    name: 'a stored Model without the attempt no longer decodes',
    edits: [
      {
        file,
        find: 'attempted: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),',
        replace: 'attempted: Schema.Boolean,',
      },
    ],
    tests,
  },
  {
    name: 'ValidatedAll records an attempt',
    edits: [
      {
        file,
        find: 'validateEvery(model, (form, row) => form.engine.validateAll(row))',
        replace:
          'validateEvery({ ...model, attempted: true }, (form, row) => form.engine.validateAll(row))',
      },
    ],
    tests,
  },
]
