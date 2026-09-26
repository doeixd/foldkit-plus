/**
 * Checks the built richtext packages the way a consumer meets them: through each
 * package's `exports` map, from `dist`. Everything inside this workspace resolves
 * those packages from source, so nothing else would catch a wrong `exports` path
 * or a missing file. Run `pnpm build` first, then `pnpm --filter
 * foldkit-mixins-richtext smoke`.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const checks = []
const check = (name, ok) => checks.push([name, ok])

const richtext = await import('foldkit-richtext')
check('richtext', typeof richtext.run === 'function' && typeof richtext.marksInRange === 'function')

const interpreter = await import('foldkit-richtext-dom')
check('richtext-dom (interpreter)', typeof interpreter.mount === 'function')

const host = await import('foldkit-richtext-dom/host')
check(
  '/host',
  typeof host.mountInto === 'function' &&
    typeof host.attachmentIn === 'function' &&
    typeof host.placeRendering === 'function' &&
    typeof host.renderingFor === 'function' &&
    typeof host.placeVocabulary === 'function' &&
    typeof host.vocabularyFor === 'function',
)

const events = await import('foldkit-richtext-dom/events')
check('/events', typeof events.attach === 'function' && typeof events.intentFor === 'function')

const html = await import('foldkit-richtext-dom/html')
check('/html', typeof html.parseHtml === 'function')

// §124 §10: an import reads only allowlisted attributes, and a URL whose scheme the
// policy refuses is reported rather than carried into props.
const refused =
  richtext.safeUrl('javascript:alert(1)') === undefined && richtext.safeUrl('/x?a=1') === '/x?a=1'
check('a URL policy through the build', refused)

const view = await import('foldkit-richtext-dom/view')
check('/view', typeof view.renderDocument === 'function' && typeof view.renderBlocks === 'function')

const toolbar = await import('foldkit-richtext-dom/toolbar')
check(
  '/toolbar',
  typeof toolbar.marksToolbar === 'function' && typeof toolbar.markActive === 'function',
)

const editor = await import('foldkit-richtext-dom/editor')
check(
  '/editor',
  typeof editor.toMessage === 'function' &&
    typeof editor.attachEditor === 'function' &&
    typeof editor.events === 'function' &&
    typeof editor.patchEditor === 'function' &&
    typeof editor.slashQuery === 'function' &&
    typeof editor.slashMenu === 'function' &&
    Array.isArray(editor.slashEntries),
)

// §123: the catalogue is the editor's, and an entry carries the Message choosing it, so
// the menu's choice is a Message the Bundle can handle as if it had arrived.
check(
  'the editor catalogue chooses an editor Message',
  editor.slashMenu(editor.slashEntries, '/h2', 0)?.highlighted?.message?._tag === 'RetypedBlock',
)

const bundle = await import('foldkit-richtext-dom/editor-bundle')
check(
  '/editor-bundle',
  typeof bundle.editorAt === 'function' &&
    typeof bundle.update === 'function' &&
    typeof bundle.edited === 'function',
)

const family = await import('foldkit-mixins-richtext')
check(
  'mixins-richtext',
  typeof family.markToolbar === 'function' &&
    typeof family.MarkToolbarSlots === 'object' &&
    typeof family.slashQuery === 'function' &&
    typeof family.slashEntries === 'function' &&
    typeof family.slashMenuView === 'function' &&
    typeof family.SlashMenuSlots === 'object',
)

// §123: a slash query opens on `/` at a block's start, and `/head` narrows to the
// headings — the menu's vocabulary, exercised through the build.
check('a slash query through the build', family.slashQuery('see /head') === 'head')
const wrapped = family.slashEntries(message => message)
check(
  'the menu narrows to the headings',
  family
    .matchingEntries(wrapped, 'head')
    .map(entry => entry.id)
    .join(',') === 'heading-1,heading-2,heading-3',
)

// One real transaction, not just an export probe: a wrong shape N exported would
// still import.
const document = richtext.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }] },
  ],
})
const at = offset => ({ node: richtext.NodeId.make('a'), offset, affinity: 'after' })
const result = richtext.run(
  { document, selection: { type: 'Range', anchor: at(2), focus: at(2) } },
  { type: 'InsertText', text: '!' },
  { mint: () => 'new-1' },
)
check(
  'a transaction through the build',
  result.ok && result.state.document.children[0].children[0].text === 'ab!',
)
check('marksInRange through the build', richtext.marksInRange(document, null).size === 0)

// §124 §5: a composed action commits its commands as one step, over the range a rule
// matched. Both the read and the runner are public surface.
const marker = richtext.textRangeBefore(document, at(2), 2)
const composed = richtext.runAction(
  { document, selection: { type: 'Range', anchor: at(2), focus: at(2) } },
  [{ type: 'SetSelection', selection: marker }, { type: 'DeleteBackward' }],
  { mint: () => 'new-2' },
)
check(
  'a composed action through the build',
  marker !== undefined && composed.ok && richtext.documentToText(composed.state.document) === '',
)

// The rendering registry is the newest public surface, so exercise it rather than
// just importing it.
const linked = richtext.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p2',
      children: [
        {
          type: 'Text',
          id: 'b',
          text: 'docs',
          marks: [{ name: 'Link', props: { href: '/x?a=1&b=2' } }],
        },
      ],
    },
  ],
})
const renderer = richtext.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(richtext.markProps(mark)?.href ?? '') },
    }),
  },
})
check(
  'a declared mark renders through the build',
  richtext.documentToHtml(linked, renderer) === '<p><a href="/x?a=1&amp;b=2">docs</a></p>',
)
check(
  'the name fallback survives the build',
  richtext.documentToHtml(linked) === '<p><span data-marks="Link">docs</span></p>',
)

// §122: a registry placed for a host id is what the editor mount reads back, and
// the recorded identity is the registry itself, not a copy of it.
host.placeRendering('smoke-placed', renderer)
check('a registry placed for a host id', host.renderingFor('smoke-placed') === renderer)
check('the default for an unplaced id', host.renderingFor('smoke-none') === richtext.noRendering)

// §125: the standard vocabulary and a constraint, and a placement's vocabulary, which
// is what its editor resolves edits against.
check(
  'the standard vocabulary through the build',
  richtext.standardNodes.some(definition => definition.name === 'List') &&
    richtext.standardMarks.some(definition => definition.name === 'Link'),
)
host.placeVocabulary('smoke-vocab', {
  nodes: richtext.nodeRegistry([
    richtext.node('CodeBlock', { children: richtext.textContent, marks: 'none' }),
    ...richtext.standardNodes,
  ]),
})
check('a vocabulary placed for a host id', host.vocabularyFor('smoke-vocab').nodes !== undefined)
check(
  'the default for an unplaced vocabulary',
  Object.keys(host.vocabularyFor('smoke-empty')).length === 0,
)

// §126: a decoration set projects onto the runs it covers, which is what a renderer reads.
const projected = richtext.decorationsIn(document, [{ from: at(0), to: at(2), kind: 'search' }])
check(
  'decorations project through the build',
  projected.get(richtext.NodeId.make('a'))?.[0]?.to === 2,
)

// §126: a producer for the substrate, so a search needs no hand-made decoration.
check(
  'a search produces decorations through the build',
  richtext.searchDecorations(document, 'a').length === 1 &&
    richtext.positionInBlock(document.children[0], 0)?.offset === 0,
)

// §125: the standard vocabulary's rendering, which is what makes a declared kind an
// element rather than a placeholder — and a void one stays open.
const standard = richtext.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Node',
      kind: 'List',
      id: 'sl',
      props: { ordered: true, start: 2 },
      children: [],
      blocks: [
        {
          type: 'Node',
          kind: 'ListItem',
          id: 'sli',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'sp',
              children: [{ type: 'Text', id: 'st', text: 'one', marks: [] }],
            },
          ],
        },
      ],
    },
  ],
})
check(
  'the standard rendering through the build',
  richtext.documentToHtml(standard, richtext.standardRendering) ===
    '<ol start="2"><li><p>one</p></li></ol>',
)

const consumer = fileURLToPath(new URL('./consumer.ts', import.meta.url))
let types = true
try {
  execSync(
    `pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom "${consumer}"`,
    { stdio: 'pipe' },
  )
} catch {
  types = false
}
check('the types conditions', types)

for (const [name, ok] of checks) console.log(`${ok ? 'ok   ' : 'FAIL '}${name}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
