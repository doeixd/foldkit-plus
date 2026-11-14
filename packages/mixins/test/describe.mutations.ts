/**
 * `SlotView.describe` and `SlotView.resolution`:
 * `pnpm mutate packages/mixins/test/describe.mutations.ts`.
 */
const unit = ['packages/mixins/test/describe.test.ts']
const surface = ['packages/mixins-surface/test/surfaceView.test.ts']

export default [
  {
    name: 'a contribution that reads the input is reported as empty',
    edits: [
      {
        file: '../src/describe.ts',
        find: "if (isDynamic(contribution)) return 'unknown'",
        replace: 'if (isDynamic(contribution)) return { classes: [], mounts: [] }',
      },
    ],
    tests: unit,
  },
  {
    name: 'an attribute is reported with its value',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'onNone: () => note(into.attributes, attributeNameOf(other._tag, other), owner),',
        replace:
          'onNone: () => note(into.attributes, `${attributeNameOf(other._tag, other)}=${String((other as { value?: unknown }).value)}`, owner),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a style declaration is reported with its value',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'for (const property of Object.keys(value)) note(into.style, property, owner)',
        replace:
          'for (const [property, entry] of Object.entries(value)) note(into.style, `${property}:${entry}`, owner)',
      },
    ],
    tests: unit,
  },
  {
    name: 'an attachment loses its order',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'return { order, name: mixin.name,',
        replace: 'return { order: 0, name: mixin.name,',
      },
    ],
    tests: unit,
  },
  {
    name: 'an attachment loses its kind',
    edits: [
      {
        file: '../src/describe.ts',
        find: "kind: mixin.meta?.kind ?? 'mixin'",
        replace: "kind: 'mixin'",
      },
    ],
    tests: unit,
  },
  {
    name: 'the Mounts a static contribution gives are left out',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'mounts: (contribution.mounts ?? []).map(mount => mount.name),',
        replace: 'mounts: [],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a composition declares nothing of its parts',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'events: unique([...(own?.requires.events ?? []), ...parts.flatMap(part => part.events)]),',
        replace: 'events: unique([...(own?.requires.events ?? [])]),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a conflict is thrown rather than reported',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'if (!(error instanceof DiagnosticError)) throw error',
        replace: 'throw error',
      },
    ],
    tests: unit,
  },
  {
    name: 'a name two attachments give is owned by the last',
    edits: [
      {
        file: '../src/describe.ts',
        find: 'if (!into.some(held => held.name === name)) into.push({ name, owner })',
        replace: 'into.push({ name, owner })',
      },
    ],
    tests: unit,
  },
  {
    name: 'an unnamed attachment is not warned of',
    edits: [{ file: '../src/describe.ts', find: "if (name === '') {", replace: 'if (false) {' }],
    tests: unit,
  },
  {
    name: 'SurfaceView.describe reads no attachment from the view',
    edits: [
      {
        file: '../../mixins-surface/src/surfaceView.ts',
        find: 'attachments: ui.attachments,',
        replace: 'attachments: [],',
      },
    ],
    tests: surface,
  },
  {
    name: 'SurfaceView.toMarkdown leaves out the slots and attachments',
    edits: [
      {
        file: '../../mixins-surface/src/surfaceView.ts',
        find: "lines.push('', SlotView.toMarkdown(description))",
        replace: '',
      },
    ],
    tests: surface,
  },
]
