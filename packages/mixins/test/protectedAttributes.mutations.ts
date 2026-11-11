/**
 * A Slot's protected attributes are its alone, however a Mixin spells them:
 * `pnpm mutate packages/mixins/test/protectedAttributes.mutations.ts`.
 */
const resolver = '../src/resolver.ts'
const tests = ['packages/mixins/test/resolver.test.ts']

export default [
  {
    name: 'a generic Attribute is compared by its tag, not its key',
    edits: [
      {
        file: resolver,
        find: "if (tag === 'Attribute' || tag === 'Prop') return normalizeName(key)",
        replace: "if (tag === 'Prop') return normalizeName(key)",
      },
    ],
    tests,
  },
  {
    name: 'a Prop is compared by its tag, not its key',
    edits: [
      {
        file: resolver,
        find: "if (tag === 'Attribute' || tag === 'Prop') return normalizeName(key)",
        replace: "if (tag === 'Attribute') return normalizeName(key)",
      },
    ],
    tests,
  },
  {
    name: 'a DataAttribute is compared without its data- prefix',
    edits: [
      {
        file: resolver,
        find: 'normalizeName(`data-${key}`)',
        replace: 'normalizeName(key)',
      },
    ],
    tests,
  },
  {
    name: 'a DataAttribute is compared by its tag',
    edits: [
      {
        file: resolver,
        find: "if (tag === 'DataAttribute') return normalizeName(`data-${key}`)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the protected list keeps its spelling',
    edits: [
      {
        file: resolver,
        find: '(protection?.attributes ?? []).map(attr => normalizeName(MetadataToken.nameOf(attr)))',
        replace: '(protection?.attributes ?? []).map(attr => MetadataToken.nameOf(attr))',
      },
    ],
    tests,
  },
  {
    name: 'a custom event is not read as the event it names, when claimed',
    edits: [
      {
        file: resolver,
        find: "if (tag !== 'OnCustomEvent') return undefined",
        replace: 'return undefined',
      },
    ],
    tests,
  },
  {
    name: 'a custom event name keeps its spelling',
    edits: [
      {
        file: resolver,
        find: "return typeof name === 'string' ? normalizeName(name) : undefined",
        replace: "return typeof name === 'string' ? name : undefined",
      },
    ],
    tests,
  },
  {
    name: 'a custom event is not reserved when the view sets it',
    edits: [
      {
        file: resolver,
        find: '    const eventName = eventNameOf(tag, value)\n    if (eventName !== undefined) {\n      ownedEvents.set(eventName, tag)',
        replace:
          '    const eventName = isNativeEvent(tag) ? eventNameOfTag(tag) : undefined\n    if (eventName !== undefined) {\n      ownedEvents.set(eventName, tag)',
      },
    ],
    tests,
  },
]
