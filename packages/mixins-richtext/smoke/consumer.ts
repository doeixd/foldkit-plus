/**
 * What a consumer sees: every published entry, imported the way an external
 * package would. Nothing here resolves through this workspace's source `paths`,
 * only through each package's `exports` map, so a wrong `types` entry fails here
 * and nowhere else (`tools.mjs` runs `tsc` over this file).
 */
import * as RichText from 'foldkit-richtext'
import { type EditorDom, mount } from 'foldkit-richtext-dom'
import { attachmentIn, mountInto, releaseMount } from 'foldkit-richtext-dom/host'
import { attach, intentFor, type KeyBinding } from 'foldkit-richtext-dom/events'
import { parseHtml } from 'foldkit-richtext-dom/html'
import { renderBlocks, renderDocument } from 'foldkit-richtext-dom/view'
import { markActive, marksToolbar, type ToolbarState } from 'foldkit-richtext-dom/toolbar'
import { events, Message, patchEditor, toMessage } from 'foldkit-richtext-dom/editor'
import { edited, editorAt, update } from 'foldkit-richtext-dom/editor-bundle'
import { MarkToolbarSlots, markToolbar } from 'foldkit-mixins-richtext'

export type Surface = [
  typeof RichText.marksInRange,
  typeof RichText.rendering,
  typeof RichText.noRendering,
  typeof RichText.runRendering,
  typeof RichText.nodeRendering,
  RichText.Rendering,
  RichText.ElementRendering,
  typeof mount,
  EditorDom,
  typeof attachmentIn,
  typeof mountInto,
  typeof releaseMount,
  typeof attach,
  typeof intentFor,
  KeyBinding,
  typeof parseHtml,
  typeof renderDocument,
  typeof markActive,
  typeof marksToolbar,
  ToolbarState,
  typeof events,
  typeof Message.Typed,
  typeof patchEditor,
  typeof toMessage,
  typeof editorAt,
  typeof edited,
  typeof update,
  typeof MarkToolbarSlots,
  typeof markToolbar,
]

/**
 * The renderer is one value shared by the serializer and the view (§121), so the
 * view's parameters have to accept it too.
 */
export const renderedWith = (document: RichText.Document, renderer: RichText.Rendering) => [
  renderDocument(document, renderer),
  ...renderBlocks(document.children, renderer),
]
