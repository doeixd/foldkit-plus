/**
 * An editor's submission (busy, refusals, retry), broken in turn:
 * `pnpm mutate packages/crud/test/submission.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/crud/test/submission.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the editor is never busy',
    "const busy = (root: Root): boolean => saveOf(root)._tag === 'Pending'",
    'const busy = (_root: Root): boolean => false',
  ),
  edit('a submit while busy writes again', 'if (busy(root)) return { model: root }', ''),
  edit(
    'a failed save is never sent again as itself',
    'Option.filter(failure(root), ({ retry }) => retry)',
    'Option.filter(failure(root), () => false)',
  ),
  edit(
    'a refused save is sent again as itself',
    'Option.filter(failure(root), ({ retry }) => retry)',
    'Option.filter(failure(root), () => true)',
  ),
  edit(
    'a failure still shows once the form was edited',
    "if (save._tag !== 'Failed' || slice.get(root).edited) return Option.none()",
    "if (save._tag !== 'Failed') return Option.none()",
  ),
  edit('a refusal of a field shows on the form too', 'namedBy(refusal).length > 0', 'false'),
  edit(
    'an invariant’s refusal says the transport’s words',
    'error: Refusal.isInvalid(refusal) ? refusal.message : save.error.message,',
    'error: save.error.message,',
  ),
  edit(
    'a failure is not offered again',
    'Option.some({ error: save.error.message, retry: save.error.refusal === undefined }),',
    'Option.some({ error: save.error.message, retry: false }),',
  ),
  edit(
    'the page’s own busy flag is dropped',
    'submitting: busy(root) || (given as SubmitInputs | undefined)?.submitting === true,',
    'submitting: busy(root),',
  ),
  edit(
    'the page’s own failure is dropped',
    `failure: Option.getOrElse(
                  failure(root),
                  () => (given as SubmitInputs | undefined)?.failure,
                ),`,
    'failure: Option.getOrUndefined(failure(root)),',
  ),
]
