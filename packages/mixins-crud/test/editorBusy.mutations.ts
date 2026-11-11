/**
 * The drawn editor's busy state and its failure, broken:
 * `pnpm mutate packages/mixins-crud/test/editorBusy.mutations.ts`.
 */
const tests = ['packages/mixins-crud/test/editorBusy.browser.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the drawn form never reads its save',
    '../../crud/src/index.ts',
    'submitting: busy(root) || own.submitting === true,',
    'submitting: own.submitting === true,',
  ),
  edit(
    'a placement draws with the inputs given, never its own',
    '../../bundle/src/placed.ts',
    ': config.viewInputs(parent, given)',
    ': given',
  ),
  edit(
    'the form is never drawn busy',
    '../../mixins-form/src/index.ts',
    "...(submitting ? [h.AriaBusy(true), h.DataAttribute('submitting', '')] : []),",
    '',
  ),
  edit(
    'the submit is natively disabled while it cannot submit or submits, and drops its focus',
    '../../mixins-form/src/index.ts',
    '...(!input.canSubmit || submitting ? [h.AriaDisabled(true)] : [])',
    'h.Disabled(!input.canSubmit || submitting)',
  ),
  edit(
    'a press while the save is in flight writes again',
    '../../crud/src/index.ts',
    'if (busy(root)) return { model: root }',
    '',
  ),
  edit(
    'the editor announces a failed save as well as the form',
    '../src/editor.ts',
    "SaveFailed: { line: 'none', words: undefined, form: true },",
    "SaveFailed: { line: 'alert', words: 'saving', form: true },",
  ),
]
