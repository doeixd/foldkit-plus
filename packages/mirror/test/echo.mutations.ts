/**
 * A URL mirror reading back its own writes, broken in turn (#379):
 * `pnpm mutate packages/mirror/test/echo.mutations.ts`.
 */
const unit = ['packages/mirror/test/url.test.ts']
const edit = (find: string, replace: string) => [{ file: '../src/index.ts', find, replace }]

export default [
  {
    name: 'an awaited echo is read like a navigation',
    edits: edit('if (echo >= 0) {', 'if (false) {'),
    tests: [...unit, 'packages/mirror/test/echo.browser.test.ts'],
  },
  {
    name: 'an echo is awaited again after it came',
    edits: edit('awaited.splice(0, echo + 1)', ''),
    tests: unit,
  },
  {
    name: 'a URL leaving the keys as last seen is read',
    edits: edit(
      'return Option.contains(seen, text) ? model : read(model, url)',
      'return read(model, url)',
    ),
    tests: unit,
  },
  {
    name: 'a write is not what the mirror last saw',
    edits: edit('        seen = Option.some(text)\n', ''),
    tests: unit,
  },
  {
    name: 'a starting URL keeps awaiting an earlier write',
    edits: edit('awaited.length = 0', ''),
    tests: unit,
  },
  {
    name: 'the wiring reads a URL Message with reduce',
    edits: edit(
      'Option.some({ model: urlChanged(model, message.url) })',
      'Option.some({ model: reduce(model, message.url) })',
    ),
    tests: unit,
  },
  {
    name: 'Mirror.routing reads a URL Message with reduce',
    edits: edit(
      'isUrlChanged(message) ? changed(model, message.url) : model',
      'isUrlChanged(message) ? read(model, message.url) : model',
    ),
    tests: unit,
  },
]
