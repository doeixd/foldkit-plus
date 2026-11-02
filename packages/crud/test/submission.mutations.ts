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
    'an invariant’s refusal says the generic words',
    'if (Refusal.isInvalid(refusal)) return refusal.message',
    'if (Refusal.isInvalid(refusal)) return words.refused',
  ),
  edit(
    'a conflict says the generic words',
    'if (Refusal.isConflict(refusal)) return words.conflict',
    '',
  ),
  edit(
    'a failure says the transport’s message',
    '? { error: words.failed, retry: true }',
    '? { error: save.error.message, retry: true }',
  ),
  edit(
    'a failure is not offered again',
    '? { error: words.failed, retry: true }',
    '? { error: words.failed, retry: false }',
  ),
  edit(
    'an undeclared refusal is offered again',
    ': { error: words.refused, retry: false },',
    ': { error: words.refused, retry: true },',
  ),
  edit(
    'the page’s words are ignored',
    'refused: config.words?.refused ?? saveWords.refused,',
    'refused: saveWords.refused,',
  ),
  edit(
    'the page’s own busy flag is dropped',
    'submitting: busy(root) || own.submitting === true,',
    'submitting: busy(root),',
  ),
  edit(
    'the page’s own saved flag is dropped',
    'saved: saved(root) || own.saved === true,',
    'saved: saved(root),',
  ),
  edit(
    'the editor never says its save landed',
    'saved: saved(root) || own.saved === true,',
    'saved: own.saved === true,',
  ),
  edit(
    'a landed save stays so through an edit',
    'return requestId !== null && Option.contains(settledFor, requestId) && !edited',
    'return requestId !== null && Option.contains(settledFor, requestId)',
  ),
  edit(
    'the editor’s failure beats the page’s',
    'failure: own.failure ?? Option.getOrUndefined(failure(root)),',
    'failure: Option.getOrElse(failure(root), () => own.failure),',
  ),
]
