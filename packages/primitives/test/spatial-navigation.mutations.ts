/**
 * SpatialNavigation, each part broken in turn: `pnpm mutate
 * packages/primitives/test/spatial-navigation.mutations.ts` checks a test fails for every one.
 */
const file = '../src/interaction/spatial-navigation.ts'
const unit = ['packages/primitives/test/spatial-navigation.test.ts']
const browser = ['packages/primitives/test/spatial-navigation.browser.test.ts']

export default [
  {
    name: 'an item off the cone ranks with those inside it',
    edits: [{ file, find: '(cone && !best.cone) ||', replace: 'false ||' }],
    tests: unit,
  },
  {
    name: 'distance aside counts once',
    edits: [
      { file, find: 'const score = ahead + aside * 2', replace: 'const score = ahead + aside' },
    ],
    tests: unit,
  },
  {
    name: 'an item level with the current one counts as ahead',
    edits: [{ file, find: 'if (ahead <= 0) continue', replace: 'if (ahead < 0) continue' }],
    tests: unit,
  },
  {
    name: 'a tie goes to the item listed last',
    edits: [
      {
        file,
        find: '(cone === best.cone && score < best.score)',
        replace: '(cone === best.cone && score <= best.score)',
      },
    ],
    tests: unit,
  },
  {
    name: 'the same focus again makes a new Model',
    edits: [
      {
        file,
        find: 'isCurrent(model, id) ? { model } : { model: { current: Option.some(id) } },',
        replace: '{ model: { current: Option.some(id) } },',
      },
    ],
    tests: unit,
  },
  {
    name: 'Home and End answer with modifiers held',
    edits: [
      {
        file,
        find: 'if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return Option.none()',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a move starts from the Model, not from the item focused now',
    edits: [
      {
        file,
        find: 'items.find(item => active !== null && item.contains(active)) ??',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a disabled item is a candidate',
    edits: [
      {
        file,
        find: '.filter(item => item === start || item.hasAttribute(ITEM))',
        replace: '.filter(() => true)',
      },
    ],
    tests: browser,
  },
  {
    name: 'a nested navigation lends its items to the outer one',
    edits: [
      {
        file,
        find: 'element => element.parentElement?.closest(`[${NAVIGATION}]`) === container,',
        replace: '() => true,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the focused item is not scrolled into view',
    edits: [
      {
        file,
        find: "element.scrollIntoView({ block: 'nearest', inline: 'nearest' })",
        replace: 'undefined',
      },
    ],
    tests: browser,
  },
  {
    name: 'an arrow that finds nothing still moves focus somewhere',
    edits: [
      {
        file,
        find: `      return Option.match(nearest(placed, startId, direction), {
        onNone: () => Message.Stayed(),`,
        replace: `      return Option.match(nearest(placed, startId, direction), {
        onNone: () => {
          const other = items.find(item => item !== start)
          if (other !== undefined && focusable(other)) focusInView(other)
          return Message.Stayed()
        },`,
      },
    ],
    tests: browser,
  },
  {
    name: 'two navigations share one container',
    edits: [
      {
        file,
        find: 'Option.match(markedWith(document, NAVIGATION, navigation), {\n    onNone: () => Message.Stayed(),\n    onSome: container => {\n      const items',
        replace:
          'Option.match(Option.fromUndefinedOr(marked(document, NAVIGATION)[0]), {\n    onNone: () => Message.Stayed(),\n    onSome: container => {\n      const items',
      },
    ],
    tests: browser,
  },
]
