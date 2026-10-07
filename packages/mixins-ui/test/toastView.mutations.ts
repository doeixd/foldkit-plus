/**
 * The forked toast view, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toastView.mutations.ts` checks that a
 * test fails for every one. The parity battery draws the fork against
 * upstream's markup, so a fork-only change that keeps the adapter compiling
 * must still fail here.
 */
const tests = ['packages/mixins-ui/test/toastView.test.ts']

export default [
  {
    name: 'the region announces as a status',
    edits: [
      {
        file: '../src/toastView.ts',
        find: "h.Role('region'),",
        replace: "h.Role('status'),",
      },
    ],
    tests,
  },
  {
    name: 'the live region is assertive',
    edits: [
      {
        file: '../src/toastView.ts',
        find: "h.AriaLive('polite'),",
        replace: "h.AriaLive('assertive'),",
      },
    ],
    tests,
  },
  {
    name: 'info entries announce as alerts',
    edits: [
      {
        file: '../src/toastView.ts',
        find: "Match.when('Info', () => 'status'),",
        replace: "Match.when('Info', () => 'alert'),",
      },
    ],
    tests,
  },
  {
    name: 'entries lose their variant role',
    edits: [
      {
        file: '../src/toastView.ts',
        find: 'h.Role(variantToRole(entry.variant)),',
        replace: "h.Role('presentation'),",
      },
    ],
    tests,
  },
  {
    name: 'entries carry no dismiss message',
    edits: [
      {
        file: '../src/toastView.ts',
        find: 'h.OnClick(bound.Message.Dismissed({ entryId: entry.id })),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'entries draw without content',
    edits: [
      {
        file: '../src/toastView.ts',
        find: "h.keyed('div')(entry.id, [...entry.attributes], [entry.content]),",
        replace: "h.keyed('div')(entry.id, [...entry.attributes], []),",
      },
    ],
    tests,
  },
]
