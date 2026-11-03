/**
 * The compiled result row, wrong in turn, so the byte-identity test must see it:
 * `pnpm mutate examples/foldkit/domains-plus/test/compiledRow.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/compiledRow.test.ts']

export default [
  {
    name: 'a taken name loses its mark',
    edits: [
      {
        file: './compiledRow.ts',
        find: `Unconfirmed: () => ({ mark: ' data-unavailable=""', action: takenAction }),`,
        replace: `Unconfirmed: () => ({ mark: '', action: takenAction }),`,
      },
    ],
    tests,
  },
  {
    name: 'a name in the cart shows the cart icon',
    edits: [
      {
        file: './compiledRow.ts',
        find: '${added ? statics.checkIcon : statics.cartIcon}',
        replace: '${added ? statics.cartIcon : statics.checkIcon}',
      },
    ],
    tests,
  },
  {
    name: 'a cart form takes the binding after its own',
    edits: [
      {
        file: './compiledRow.ts',
        find: 'const binding = bindings.push(message) - 1',
        replace: 'const binding = bindings.push(message)',
      },
    ],
    tests,
  },
  {
    name: 'the key marker reads the bare name',
    edits: [
      {
        file: './compiledRow.ts',
        find: 'fingerprint(`s:${listing.name}`)',
        replace: 'fingerprint(listing.name)',
      },
    ],
    tests,
  },
]
