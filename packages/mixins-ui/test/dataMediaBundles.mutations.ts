/**
 * The data and media Bundles, broken in turn: `pnpm mutate
 * packages/mixins-ui/test/dataMediaBundles.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/dataMediaBundles.test.ts']

const mutation = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'a marquee placed without its args',
    '../src/bundles/marquee.ts',
    'init: args => ({ model: init(args) }),',
    'init: args => ({ model: init({ id: args.id }) }),',
  ),
  mutation(
    'a cropper export not reported',
    '../src/bundles/imageCropper.ts',
    'outMessage: OutMessage.Exported({ url, width, height }),',
    '',
  ),
  mutation(
    'a cropper failure not reported',
    '../src/bundles/imageCropper.ts',
    'outMessage: OutMessage.FailedExport({ reason }),',
    '',
  ),
  mutation(
    'a signature PNG not reported',
    '../src/bundles/signaturePad.ts',
    'outMessage: OutMessage.ExportedPng({ url, width, height }),',
    '',
  ),
  mutation(
    'a signature pen arg dropped',
    '../src/bundles/signaturePad.ts',
    'init: args => ({ model: init(args) }),',
    'init: args => ({ model: init({ id: args.id }) }),',
  ),
  mutation(
    'a drop of no files reported as files',
    '../src/bundles/fileDrop.ts',
    'RejectedNonFiles: () => OutMessage.RejectedNonFiles(),',
    "RejectedNonFiles: () => OutMessage.ReceivedFiles({ files: [new File([], 'none')] }),",
  ),
  mutation(
    'a drop not reported',
    '../src/bundles/fileDrop.ts',
    'Option.match(Option.fromUndefinedOr(next.outMessage), {',
    'Option.match(Option.none<NonNullable<typeof next.outMessage>>(), {',
  ),
]
