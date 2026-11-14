/**
 * WindowList.reveal, broken in turn: `pnpm mutate packages/mixins-ui/test/windowListReveal.mutations.ts`.
 */
const file = '../src/windowList.ts'
const unit = ['packages/mixins-ui/test/windowList.test.ts']
const tests = ['packages/mixins-ui/test/windowListReveal.browser.test.ts']

export default [
  {
    name: 'a row far outside the window is not scrolled towards',
    edits: [
      {
        file,
        find: "window.scrollBy({ top: (index - at) * mean, behavior: 'instant' })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the row drawn is shown at the top whatever alignment was asked',
    edits: [{ file, find: 'block: align, inline', replace: "block: 'start', inline" }],
    tests,
  },
  {
    name: 'the alignment is dropped between reveal and the Command',
    edits: [
      {
        file,
        find: 'Reveal({ id: model.id, index, align })',
        replace: "Reveal({ id: model.id, index, align: 'start' })",
      },
    ],
    tests,
  },
  {
    name: 'reveal names another list',
    edits: [
      {
        file,
        find: 'Reveal({ id: model.id, index, align })',
        replace: "Reveal({ id: 'other', index, align })",
      },
    ],
    tests: unit,
  },
  {
    name: 'reveal defaults to showing the row at the start',
    edits: [{ file, find: "align: Align = 'nearest'", replace: "align: Align = 'start'" }],
    tests: unit,
  },
  {
    name: 'the row is looked for one place off',
    edits: [{ file, find: 'String(index + 1))', replace: 'String(index))' }],
    tests,
  },
  {
    name: 'the scroll to a row drawn is smooth',
    edits: [
      {
        file,
        find: "block: align, inline: 'nearest', behavior: 'instant'",
        replace: "block: align, inline: 'nearest', behavior: 'smooth'",
      },
    ],
    tests,
  },
  {
    name: 'the row is taken as placed after one scroll, not once it stops moving',
    edits: [
      {
        file,
        find: 'if (target.isConnected && top === previous) return',
        replace: 'if (target.isConnected) return',
      },
    ],
    tests,
    survives:
      'under pnpm mutate the row has settled within the two frames before the check; the same edit in a plain run fails the "still there" check by 28px, so the loop is kept for the runs where it has not',
  },
  {
    name: 'a row never reached is tried without end',
    edits: [{ file, find: 'attempt < REVEAL_ATTEMPTS', replace: 'attempt < 1' }],
    tests,
  },
]
