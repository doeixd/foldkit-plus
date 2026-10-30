/**
 * `WindowViewport`, `MeasureRows` and the border box `MeasureRow` reports,
 * broken in turn:
 * `pnpm mutate packages/primitives/test/windowViewport.mutations.ts`.
 */
const tests = ['packages/primitives/test/virtual-mounts.test.ts']
const file = '../src/state/virtual.ts'

export default [
  {
    name: 'the viewport is read from the window, not past the box',
    edits: [
      { file, find: 'top: -element.getBoundingClientRect().top,', replace: 'top: window.scrollY,' },
    ],
    tests,
  },
  {
    name: 'an unchanged reading is sent again',
    edits: [
      {
        file,
        find: 'if (last !== undefined && last.top === placed.top && last.height === placed.height) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a resize of the window is not heard',
    edits: [
      { file, find: "window.addEventListener('resize', report, { passive: true })", replace: '' },
    ],
    tests,
  },
  {
    name: 'the page resizing is not observed',
    edits: [{ file, find: 'observer?.observe(document.documentElement)', replace: '' }],
    tests,
  },
  {
    name: 'the window listeners outlive the Mount',
    edits: [{ file, find: "window.removeEventListener('scroll', report)", replace: '' }],
    tests,
  },
  {
    name: 'the observer outlives the Mount',
    edits: [{ file, find: '            observer?.disconnect()', replace: '' }],
    tests,
  },
  {
    name: 'a row reports its content box',
    edits: [
      {
        file,
        find: 'const box = entries[0]?.borderBoxSize[0]',
        replace: 'const box = { blockSize: entries[0]?.contentRect.height ?? 0 }',
      },
    ],
    tests,
  },
  {
    name: 'a child without the key attribute is measured as a row',
    edits: [
      {
        file,
        find: 'Array.from(element.children).filter(child => child.hasAttribute(attribute)),',
        replace: 'Array.from(element.children),',
      },
    ],
    tests,
  },
  {
    name: 'a row gone stays observed',
    edits: [{ file, find: '                  sizes.unobserve(row)', replace: '' }],
    tests,
  },
  {
    name: 'rows drawn later are not observed',
    edits: [{ file, find: 'children.observe(element, { childList: true })', replace: '' }],
    tests,
  },
  {
    name: 'a batch is sent a row at a time',
    edits: [
      {
        file,
        find: 'if (rows.length > 0) Queue.offerUnsafe(queue, RowsMeasured.make({ rows }))',
        replace:
          'for (const one of rows) Queue.offerUnsafe(queue, RowsMeasured.make({ rows: [one] }))',
      },
    ],
    tests,
  },
  {
    name: 'the rows observer outlives the Mount',
    edits: [{ file, find: '              sizes.disconnect()', replace: '' }],
    tests,
  },
]
