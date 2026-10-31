/**
 * `why` and `timeline`, broken in turn:
 * `pnpm mutate packages/remote/test/why.mutations.ts`.
 */
const tests = [
  'packages/remote/test/why.test.ts',
  'packages/remote/test/whyReasons.test.ts',
  'packages/remote/test/timeline.test.ts',
  'packages/remote/test/unavailable.test.ts',
  'packages/remote/test/trace.test.ts',
]
const terms = '../src/whyTerms.ts'
const reasons = '../src/whyReasons.ts'
const why = '../src/why.ts'
const index = '../src/index.ts'
const edit = (name: string, find: string, replace: string, file = reasons) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the reason that decides the state is left where it was found',
    'decisive <= 0 ? because : [because[decisive]!, ...because.filter((_, at) => at !== decisive)]',
    'because',
    terms,
  ),
  edit(
    'the message speaks of the first reason, deciding or not',
    'message: decisive === -1 ? stateWords[state] : whyWords(because[decisive]!),',
    'message: because.length === 0 ? stateWords[state] : whyWords(because[0]!),',
    terms,
  ),
  edit(
    'a stale list with no pages reads as stale',
    'if (connection === undefined || (connection.stale && connection.segments.length === 0)) {',
    'if (connection === undefined) {',
  ),
  edit(
    'a list’s failure is not named',
    'failure === undefined ? [] : [Why.ListFailed({ list, error: failure })]',
    '[]',
  ),
  edit(
    'no field is in flight',
    ';(remote.loading.has(fieldMark(entity, id, field)) ? flying : resting).push(field)',
    'resting.push(field)',
  ),
  edit(
    'every present field is stale',
    'field => entry !== undefined && entry.present.has(field) && entry.stale.has(field),',
    'field => entry !== undefined && entry.present.has(field),',
  ),
  edit(
    'a field settled without a value is missing too',
    'field => entry === undefined || (!entry.present.has(field) && !entry.unavailable.has(field)),',
    'field => entry === undefined || !entry.present.has(field),',
  ),
  edit(
    'a related row loses its path',
    'reasons.push(...rowReasons(reader, target.entity, target.id, nested, [...via, field], walked))',
    'reasons.push(...rowReasons(reader, target.entity, target.id, nested, via, walked))',
  ),
  edit(
    'the oldest writer is named',
    'Arr.findLast(remote.optimistic.layers, layer => touches(layer, entity, id)),',
    'Arr.findFirst(remote.optimistic.layers, layer => touches(layer, entity, id)),',
  ),
  edit(
    'a pending write names every field it writes',
    'const fields = relation.fields.filter(field => written.has(field))',
    'const fields = [...written]',
  ),
  edit('a true term reads false', "true: 'True',", "true: 'False',"),
  edit(
    'an insert overlay is not named',
    'by: Option.orElse(overlayOf(remote, identity, edge.key, false), () =>',
    'by: Option.orElse(Option.none(), () =>',
  ),
  edit(
    'a row past the window has left',
    'const shows = new Set(placed.map(edge => edge.key))',
    'const shows = new Set(shown.map(edge => edge.key))',
  ),
  edit(
    'a value that does not decode is not named',
    'return [Why.Undecodable({ message: error.message })]',
    'return []',
  ),
  edit(
    'a row only an overlay shows is not named',
    'return [Why.OverlayOnly({ message: error.message })]',
    'return []',
  ),
  edit(
    'a read that had nothing to show regressed',
    'shows(from) && !keeps(to)',
    '!keeps(to)',
    terms,
  ),
  edit('every read is Initial for why', "data._tag !== 'Initial'", 'false', why),
  edit(
    'an unread read blames the Subscriptions',
    'names.length === 0 ? Why.NotObserved() : Why.NotFetching({ surfaces: names }),',
    'Why.NotFetching({ surfaces: names }),',
    why,
  ),
  edit(
    'a read that is not live is asked about its stream',
    'asked.connections.some(connection => connection.live === true)',
    'true',
    why,
  ),
  edit(
    'a list’s rows are not cut to the read’s window',
    'shown: cutToWindow(placed, window, windowSize(remote, { identity, window })).edges,',
    'shown: placed,',
    index,
  ),
  edit('the timeline compares every Model with the start', 'before = entry.model', '', why),
  edit('every Message is a step', 'if (was._tag === is._tag) return []', '', why),
  edit(
    'every change is a regression',
    '.filter(change => change.regression)',
    '.filter(() => true)',
    '../src/testing.ts',
  ),
]
