/**
 * Assembly inspection, broken in turn: `pnpm mutate packages/mixins/test/assembly.mutations.ts`.
 */
const file = '../src/assembly.ts'
const tests = ['packages/mixins/test/assembly.test.ts']
const widget = ['examples/widgets/test/ui-sdk-assembly.test.ts']

export default [
  {
    name: 'a conflict names the later owner first',
    edits: [
      {
        file,
        find: 'contributors: [owner, contributor]',
        replace: 'contributors: [contributor, owner]',
      },
    ],
    tests,
  },
  {
    name: 'a dynamic behavior claims to read nothing',
    edits: [{ file, find: "reads: dynamic ? 'unknown' : 'none',", replace: "reads: 'none'," }],
    tests,
  },
  {
    name: 'resolving attributes also runs the Mount',
    edits: [
      {
        file,
        find: '    if (options === undefined) continue\n    const dynamic = options.attributes !== undefined',
        replace:
          '    if (options === undefined) continue\n    options.mount?.(input)\n    const dynamic = options.attributes !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'describe draws the view',
    edits: [
      {
        file,
        find: 'export const describe = (source: AssemblySource): Description => {\n  const slots = slotsOf(source)',
        replace:
          'export const describe = (source: AssemblySource): Description => {\n  source.view?.render(source.input, {}, SlotView.inertBuilder())\n  const slots = slotsOf(source)',
      },
    ],
    tests,
  },
  {
    name: 'the description keeps the input it resolved',
    edits: [
      {
        file,
        find: '    name: source.name,\n    slots: publicSlots(slots),',
        replace: '    name: source.name,\n    input: source.input,\n    slots: publicSlots(slots),',
      },
    ],
    tests,
  },
  {
    name: 'an Action link keeps its description',
    edits: [
      {
        file,
        find: "isActionLink(link) ? { kind: 'action', name: link.name }",
        replace:
          "isActionLink(link) ? { kind: 'action', name: link.name, description: (link as { description?: string }).description }",
      },
    ],
    tests,
  },
  {
    name: 'a hidden slot is public',
    edits: [
      {
        file,
        find: 'if (slot === undefined || slot.hidden) continue',
        replace: 'if (slot === undefined) continue',
      },
    ],
    tests,
  },
  {
    name: 'view attachments are listed last-first',
    edits: [
      { file, find: '? source.view!.mixins', replace: '? [...source.view!.mixins].reverse()' },
    ],
    tests,
  },
  {
    name: 'a part lists its behavior before its style',
    edits: [
      {
        file,
        find: '        ...(source.styles ?? []).map(style => style.mixin),\n        ...(source.behaviors ?? []).map(behavior => behavior.mixin),',
        replace:
          '        ...(source.behaviors ?? []).map(behavior => behavior.mixin),\n        ...(source.styles ?? []).map(style => style.mixin),',
      },
    ],
    tests,
  },
  {
    name: 'an unmatched dynamic mixin is called',
    edits: [
      {
        file,
        find: "    if (Mixin.isDynamic(contribution)) {\n      // Opening it would run a Behavior's Mount callback. Leave the claims unknown.\n      slots.push({",
        replace:
          '    if (Mixin.isDynamic(contribution)) {\n      contribution(undefined as never)\n      slots.push({',
      },
    ],
    tests,
  },
  {
    name: 'unknown claims are still conflicts',
    edits: [
      {
        file,
        find: "if (slot.events === 'unknown' || slot.attributes === 'unknown') continue",
        replace: 'if (slot.slot.length < 0) continue',
      },
    ],
    tests,
  },
  {
    name: 'resolved events stay unknown',
    edits: [
      {
        file,
        find: "      reads: 'unknown',\n      events: claims.events,",
        replace: "      reads: 'unknown',\n      events: 'unknown',",
      },
    ],
    tests,
  },
  {
    name: 'attributes are read with no input',
    edits: [
      {
        file,
        find: 'if (!resolve || options.attributes === undefined)',
        replace: 'if (options.attributes === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'an attribute has one owner however many set it',
    edits: [
      {
        file,
        find: "      for (const attribute of slot.attributes) {\n        claim('mixins:attribute-conflict', slot.slot, attribute, attachment.name)\n      }",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a missing pattern slot is not reported',
    edits: [
      {
        file,
        find: 'source.pattern === undefined ? [] : A11y.validate(source.pattern.pattern, patternSlots),',
        replace: '[],',
      },
    ],
    tests,
  },
  {
    name: 'the text drops an obligation',
    edits: [
      {
        file,
        find: 'obligation ${obligation.pattern}',
        replace: 'needed ${obligation.pattern}',
      },
    ],
    tests,
  },
  {
    name: 'a part is left out of the description',
    edits: [
      {
        file,
        find: 'parts: (source.parts ?? []).map(part => describe(part)),',
        replace: 'parts: [],',
      },
    ],
    tests: widget,
  },
]
