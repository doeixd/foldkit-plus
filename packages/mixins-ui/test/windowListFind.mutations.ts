/**
 * WindowList's `findable` stand-ins, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/windowListFind.mutations.ts`.
 */
const file = '../src/windowList.ts'
const unit = ['packages/mixins-ui/test/windowList.test.ts']
const tests = ['packages/mixins-ui/test/windowListFind.browser.test.ts']

export default [
  {
    name: 'a server draws stand-ins',
    edits: [
      {
        file,
        find: 'text !== undefined && model.placed',
        replace: 'text !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'the first reading does not place the list',
    edits: [{ file, find: 'model.from === 0 &&\n      model.placed', replace: 'model.from === 0' }],
    tests: unit,
  },
  {
    name: 'a row drawn also has a stand-in',
    edits: [
      {
        file,
        find: "spacer('start', startHeight(start), 0, start)",
        replace: "spacer('start', startHeight(start), 0, keys.length)",
        all: true,
      },
    ],
    tests,
  },
  {
    name: 'a stand-in has no text',
    edits: [{ file, find: '[text!(items[index]!, index)]', replace: '[]' }],
    tests,
  },
  {
    name: 'a stand-in is not hidden until found',
    edits: [
      {
        file,
        find: "[h.Attribute('hidden', 'until-found'), h.Attribute(FIND_INDEX, String(index))]",
        replace: '[h.Attribute(FIND_INDEX, String(index))]',
      },
    ],
    tests,
  },
  {
    name: 'stand-ins are not grouped',
    edits: [
      {
        file,
        find: "        `${model.id}-find-${group}`,\n        [h.Attribute('hidden', 'until-found')],",
        replace: '        `${model.id}-find-${group}`,\n        [],',
      },
    ],
    tests,
  },
  {
    name: 'the spacers take the room of their stand-ins',
    edits: [
      {
        file,
        find: "h.Style(finding ? { blockSize, position: 'relative' } : { blockSize })",
        replace: "h.Style(finding ? { position: 'relative' } : { blockSize })",
      },
    ],
    tests,
  },
  {
    name: 'stand-ins are drawn when the option is off',
    edits: [
      { file, find: 'const finding = text !== undefined &&', replace: 'const finding = true &&' },
    ],
    tests,
  },
  {
    name: 'a match is not listened for',
    edits: [{ file, find: "element.addEventListener('beforematch', onMatch)", replace: '' }],
    tests,
  },
  {
    name: 'a match is not reported',
    edits: [{ file, find: 'Queue.offerUnsafe(queue, Message.Found({ index }))', replace: '' }],
    tests,
  },
  {
    name: 'a match is revealed at the start of the viewport',
    edits: [
      {
        file,
        find: "Reveal({ id: model.id, index, align: 'center' })",
        replace: "Reveal({ id: model.id, index, align: 'start' })",
      },
    ],
    tests: unit,
  },
  {
    name: 'a stand-in matched stays out of hiding',
    edits: [{ file, find: "standIn.setAttribute('hidden', 'until-found')", replace: '' }],
    tests,
  },
  {
    name: 'a stand-in matched keeps its parking style',
    edits: [{ file, find: "standIn.removeAttribute('style')", replace: '' }],
    tests,
  },
  {
    name: 'a match on something other than a stand-in is a find',
    edits: [{ file, find: '!standIn.hasAttribute(FIND_INDEX)', replace: 'false' }],
    tests,
  },
]
