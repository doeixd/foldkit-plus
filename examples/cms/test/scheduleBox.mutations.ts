/**
 * When the studio's schedule box empties, broken one condition at a time:
 * `pnpm mutate examples/cms/test/scheduleBox.mutations.ts`.
 */
const app = '../src/apps/app.ts'
const tests = ['examples/cms/test/studioEditor.test.ts']

export default [
  {
    name: 'the box never empties',
    edits: [
      {
        file: app,
        find: "? modifyFields(after, { scheduleDraft: () => ({ entry: Option.none(), text: '' }) })",
        replace: '? after',
      },
    ],
    tests,
  },
  {
    name: 'a time typed while the schedule was on its way is emptied',
    edits: [
      {
        file: app,
        find: "PostEditor.status(after) === 'Scheduled' &&\n  scheduleInstant(scheduleText(after)) === after.editor.scheduleAt",
        replace: "PostEditor.status(after) === 'Scheduled'",
      },
    ],
    tests,
  },
  {
    name: 'judged on every Message, not at the answer',
    edits: [{ file: app, find: "PostEditor.status(before) === 'Scheduling' &&\n", replace: '' }],
    tests,
  },
  {
    name: 'emptied whenever the entry reads scheduled',
    edits: [
      { file: app, find: "PostEditor.status(before) === 'Scheduling' &&\n", replace: '' },
      {
        file: app,
        find: "PostEditor.status(after) === 'Scheduled' &&\n  scheduleInstant(scheduleText(after)) === after.editor.scheduleAt",
        replace: "PostEditor.status(after) === 'Scheduled'",
      },
    ],
    tests,
  },
  {
    name: 'a failed schedule empties the box',
    edits: [
      {
        file: app,
        find: "PostEditor.status(after) === 'Scheduled' &&",
        replace: "PostEditor.status(after) !== 'Scheduling' &&",
      },
    ],
    tests,
  },
  {
    name: 'the box is compared as typed, not as the instant asked',
    edits: [
      {
        file: app,
        find: "return Number.isNaN(at.getTime()) ? '' : at.toISOString()",
        replace: "return Number.isNaN(at.getTime()) ? '' : text",
      },
    ],
    tests,
  },
  {
    name: 'the box shows the draft of whatever post is open',
    edits: [
      {
        file: app,
        find: "Equal.equals(model.scheduleDraft.entry, PostEditor.entry(model)) ? model.scheduleDraft.text : ''",
        replace: 'model.scheduleDraft.text',
      },
    ],
    tests,
  },
  {
    name: 'a time is typed for no post in particular',
    edits: [
      {
        file: app,
        find: 'scheduleDraft: () => ({ entry: PostEditor.entry(model), text })',
        replace: 'scheduleDraft: () => ({ entry: model.scheduleDraft.entry, text })',
      },
    ],
    tests,
  },
]
