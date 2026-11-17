/**
 * The editor's accessible name, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/name.mutations.ts` checks that a test fails for every one.
 */
const events = '../src/events.ts'
const browser = 'packages/richtext-dom/test/name.browser.test.ts'
const dom = 'packages/richtext-dom/test/name.dom.test.ts'
const ssr = 'packages/richtext-dom/test/ssr.test.ts'

export default [
  {
    name: 'the label is not written',
    edits: [
      {
        file: events,
        find: "setOrRemove(current.root, 'aria-label', options.label)",
        replace: "setOrRemove(current.root, 'aria-label', undefined)",
      },
    ],
    tests: [browser, dom],
  },
  {
    name: 'a group’s label is not taken',
    edits: [
      {
        file: events,
        find: '(options.labelledBy ?? groupLabelOf(current.root))',
        replace: 'options.labelledBy',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a label of its own does not win over the group’s',
    edits: [
      {
        file: events,
        find: 'options.label === undefined ? (options.labelledBy',
        replace: 'true ? (options.labelledBy',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a click on the label does not focus the editor',
    edits: [
      { file: events, find: "labelFor?.addEventListener('click', focusFromLabel)", replace: '' },
    ],
    tests: [browser],
  },
  {
    name: 'a detached editor keeps answering the label',
    edits: [
      {
        file: events,
        find: "labelFor?.removeEventListener('click', focusFromLabel)",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the placement’s name is not given to the mounted editor',
    edits: [{ file: '../src/editor.ts', find: '...nameFor(element.id),', replace: '' }],
    tests: [dom],
  },
  {
    name: 'server markup leaves the label out',
    edits: [
      {
        file: '../src/view.ts',
        find: "...(name.label === undefined ? [] : [h.Attribute('aria-label', name.label)]),",
        replace: '',
      },
    ],
    tests: [ssr],
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
