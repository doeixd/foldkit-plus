/**
 * Lists and one relations through the adapter, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/lists.mutations.ts`.
 */
const query = '../../src/adapter/query.ts'
const relations = '../../src/adapter/relations.ts'
const layer = '../../src/adapter/layer.ts'
const binding = '../../src/adapter/binding.ts'
const lists = ['packages/remote-domain/test/adapter/query.test.ts']
const related = ['packages/remote-domain/test/adapter/relations.test.ts']

export default [
  {
    name: 'a window from the end is sent to a Query that pages forward only',
    edits: [
      {
        file: query,
        find: 'if (last !== undefined || before !== undefined)',
        replace: 'if (false)',
      },
    ],
    tests: lists,
  },
  {
    // Domain answers a take of 0 with one row.
    name: 'a page of no rows is asked of Domain',
    edits: [{ file: query, find: 'if (first !== undefined && first < 1)', replace: 'if (false)' }],
    tests: lists,
  },
  {
    name: 'a cursor of any length is sent back',
    edits: [{ file: query, find: 'after.length > MAX_CURSOR', replace: 'after.length > Infinity' }],
    tests: lists,
  },
  {
    name: 'a row its View hides is listed',
    edits: [
      {
        file: query,
        find: '.filter(id => !read.absent.has(keyOf(binding.entity, id)))',
        replace: '.filter(() => true)',
      },
    ],
    tests: lists,
  },
  {
    name: "a write's lists are read without its receipt",
    edits: [
      {
        file: query,
        find: 'onSome: receipt => ({ atLeast: receipt })',
        replace: 'onSome: () => ({})',
      },
    ],
    tests: lists,
  },
  {
    name: 'every page ends the list',
    edits: [{ file: query, find: 'answered.value.cursor === null', replace: 'true' }],
    tests: lists,
  },
  {
    name: 'every page starts the list',
    edits: [{ file: query, find: 'start: after === undefined ?', replace: 'start: true ?' }],
    tests: lists,
  },
  {
    name: 'a select of another Entity carries the listed rows',
    edits: [{ file: query, find: 'return asked.select.entity === entity', replace: 'return true' }],
    tests: lists,
  },
  {
    name: 'a live list never says it moved',
    edits: [
      {
        file: query,
        find: 'if (sameIds(ids, yield* SubscriptionRef.get(held)))',
        replace: 'if (true)',
      },
    ],
    tests: lists,
  },
  {
    name: 'a Query that answers no pages is bound',
    edits: [{ file: query, find: 'if (served.definition.paged !== true)', replace: 'if (false)' }],
    tests: lists,
  },
  {
    name: 'a list over rows no View serves is accepted by the layer',
    edits: [{ file: layer, find: 'if (!views.has(binding.entity))', replace: 'if (false)' }],
    tests: lists,
  },
  {
    name: "a write's answer carries no lists",
    edits: [{ file: layer, find: 'request.lists === undefined ? []', replace: 'true ? []' }],
    tests: lists,
  },
  {
    name: 'live lists are not watched',
    edits: [
      {
        file: layer,
        find: '...request.queries.map(asked => liveQuery(lists, asked, next)),',
        replace: '',
      },
    ],
    tests: lists,
  },
  {
    name: "a relation's target is not read",
    edits: [
      {
        file: relations,
        find: 'if (Option.isSome(to)) targets.push({ ...slice, id: to.value })',
        replace: 'void to',
      },
    ],
    tests: related,
  },
  {
    name: 'a one relation is answered as the bare id',
    edits: [
      {
        file: relations,
        find: 'onSome: to => entityKey(target.value.name, to),',
        replace: 'onSome: to => to,',
      },
    ],
    tests: related,
  },
  {
    name: 'a list of rows asked of a View is settled rather than refused',
    edits: [
      {
        file: relations,
        find: 'else if (isRelation(entity, field) && Option.isNone(target))',
        replace: 'else if (false)',
      },
    ],
    tests: related,
  },
  {
    name: "a relation slice of another Entity is read as the target's",
    edits: [
      { file: relations, find: 'if (slice.entity !== target.value.name)', replace: 'if (false)' },
    ],
    tests: related,
  },
  {
    name: 'a window on a relation is ignored',
    edits: [
      {
        file: relations,
        find: 'if (request.windows !== undefined && Object.keys(request.windows).length > 0)',
        replace: 'if (false)',
      },
    ],
    tests: related,
  },
  {
    name: 'a row two requests reach is answered twice',
    edits: [{ file: relations, find: 'if (fields === undefined) {', replace: 'if (true) {' }],
    tests: related,
  },
  {
    name: "a View's state need not hold the one relations",
    edits: [
      {
        file: binding,
        find: "if (relation.cardinality === 'one' && !state.has(key))",
        replace: 'if (false)',
      },
    ],
    tests: related,
  },
]
