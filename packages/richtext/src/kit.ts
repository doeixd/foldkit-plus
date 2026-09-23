import { Mark, type Document, type NodeId } from './document.js'

/** The two node shapes this version can declare: blocks hold runs, atoms hold nothing. */
export type NodeDefinition =
  | { readonly name: string; readonly kind: 'block'; readonly children: 'text' }
  | { readonly name: string; readonly kind: 'atom'; readonly children: 'none' }

/** Declares a block node kind: a top-level node containing text runs. */
export const block = (name: string): NodeDefinition => ({
  name,
  kind: 'block',
  children: 'text',
})

/** Declares an atom: an addressable node with no text content. */
export const atom = (name: string): NodeDefinition => ({ name, kind: 'atom', children: 'none' })

/**
 * The vocabulary one editor accepts: which node kinds and marks are available.
 * A Kit is a definition, never document state, and it never holds renderers or
 * executable code. Prop schemas, nested children, transforms, and metadata
 * arrive with the node-definition work.
 */
export interface Kit {
  readonly nodes: ReadonlyArray<NodeDefinition>
  readonly marks: ReadonlyArray<Mark>
}

export const kit = (definition: {
  readonly nodes: ReadonlyArray<NodeDefinition>
  readonly marks: ReadonlyArray<Mark>
}): Kit => Object.freeze({ nodes: [...definition.nodes], marks: [...definition.marks] })

export interface Diagnostic {
  readonly code: 'UnknownNode' | 'UnsupportedNode' | 'UnknownMark'
  readonly message: string
  readonly node?: NodeId
  readonly detail?: string
}

/** Structural summary of a Kit, for tooling and tests. */
export const inspectKit = (definition: Kit) => ({
  blocks: definition.nodes.filter(node => node.kind === 'block').length,
  atoms: definition.nodes.filter(node => node.kind === 'atom').length,
  marks: definition.marks.length,
})

/**
 * Checks a document against a Kit's vocabulary without changing it. Reports
 * preserved unknown blocks, known blocks the Kit does not declare, and marks
 * outside the Kit. Content diagnostics never strip or repair the document;
 * callers decide whether to block publishing or surface a placeholder.
 */
export const validate = (document: Document, definition: Kit): ReadonlyArray<Diagnostic> => {
  const declaredNodes = new Set(definition.nodes.map(node => node.name))
  const declaredMarks = new Set<string>(definition.marks)
  const diagnostics: Array<Diagnostic> = []
  for (const node of document.children) {
    if (node.type === 'Unknown') {
      diagnostics.push({
        code: 'UnknownNode',
        node: node.id,
        detail: node.originalType,
        message: `Unimplemented node type "${node.originalType}"`,
      })
    } else if (!declaredNodes.has(node.type)) {
      diagnostics.push({
        code: 'UnsupportedNode',
        node: node.id,
        detail: node.type,
        message: `The Kit does not declare "${node.type}"`,
      })
    }
    for (const run of node.children) {
      for (const mark of run.marks) {
        if (declaredMarks.has(mark)) continue
        diagnostics.push({
          code: 'UnknownMark',
          node: run.id,
          detail: mark,
          message: `The Kit does not declare mark "${mark}"`,
        })
      }
    }
  }
  return diagnostics
}
