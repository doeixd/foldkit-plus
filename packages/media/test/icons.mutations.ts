/**
 * The icon parser, broken in turn:
 * `pnpm mutate packages/media/test/icons.mutations.ts` checks that a test
 * fails for every one.
 */
const parser = '../src/icons/index.ts'
const tests = ['packages/media/test/icons.test.ts']

export default [
  {
    name: 'a link out is drawn',
    edits: [
      {
        file: parser,
        find: "if (attribute === 'href' && !value.startsWith('#'))",
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a reference out is drawn',
    edits: [
      {
        file: parser,
        find: "        if (!target!.trim().startsWith('#'))",
        replace: '        if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a reference in capitals is not read',
    edits: [{ file: parser, find: '([^)\'"]*)/gi)', replace: '([^)\'"]*)/g)' }],
    tests,
  },
  {
    name: 'an escape is drawn',
    edits: [
      {
        file: parser,
        find: String.raw`if (value.includes('\\')) refuse`,
        replace: 'if (false) refuse',
      },
    ],
    tests,
  },
  {
    name: 'a legacy href is refused',
    edits: [
      { file: parser, find: "written === 'xlink:href' ? 'href' : written", replace: 'written' },
    ],
    tests,
  },
  {
    name: 'a dropped element never ends',
    edits: [{ file: parser, find: 'if (DROPPED_ELEMENTS.has(tag)) dropping -= 1', replace: '' }],
    tests,
  },
  {
    name: 'a dropped element nested in another ends it',
    edits: [
      {
        file: parser,
        find: 'if (DROPPED_ELEMENTS.has(tag) && !selfClosing) dropping += 1',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the root keeps its size',
    edits: [
      {
        file: parser,
        find: 'if (!DROPPED_ROOT.has(attribute)) presentation',
        replace: 'presentation',
      },
    ],
    tests,
  },
  {
    name: 'a size in ems makes a viewBox',
    edits: [
      {
        file: parser,
        find: String.raw`const USER_UNITS = /^\d+(\.\d+)?$/`,
        replace: 'const USER_UNITS = /./',
      },
    ],
    tests,
  },
  {
    name: 'an unknown entity is kept',
    edits: [
      {
        file: parser,
        find: 'return ENTITIES.get(entity) ?? refuse(',
        replace: 'return whole ?? refuse(',
      },
    ],
    tests,
  },
  {
    name: 'a reference to no character is drawn',
    edits: [{ file: parser, find: 'point > 0 && point <= 0x10ffff', replace: 'point >= 0' }],
    tests,
  },
  {
    name: 'a hex reference is read as decimal',
    edits: [
      {
        file: parser,
        find: 'hex !== undefined ? Number.parseInt(hex, 16)',
        replace: 'hex !== undefined ? Number.parseInt(hex, 10)',
      },
    ],
    tests,
  },
  {
    name: 'a transformed alias draws its parent unturned',
    edits: [{ file: parser, find: 'if (alias.rotate !== undefined ||', replace: 'if (false &&' }],
    tests,
  },
  {
    name: 'an alias’s own box is ignored',
    edits: [
      {
        file: parser,
        find: 'const nearest = [...boxes, icon, set]',
        replace: 'const nearest = [icon, set]',
      },
    ],
    tests,
  },
  {
    name: 'a serialized quote ends its attribute',
    edits: [{ file: '../src/icon.ts', find: ".replace(/\"/g, '&quot;')", replace: '' }],
    tests,
  },
]
