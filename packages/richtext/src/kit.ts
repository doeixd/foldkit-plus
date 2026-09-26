import { Schema } from 'effect'
import {
  blockContent,
  eachBlock,
  textContent,
  type Block,
  type ContentMode,
  type Document,
  type NodeBlock,
  type NodeId,
  type PropsSchema,
  type RunMark,
} from './document.js'
import { markName, markProps, propsFailure, type MarkDef } from './marks.js'

/** Whether a kind's runs may carry formatting marks; `all` unless declared otherwise. */
export type MarksPolicy = 'all' | 'none'

/**
 * Block content that accepts only the named kinds, so a `List` can declare that its
 * children are `ListItem`s and `validate` can report one that is not (§13, §125).
 */
export interface BlockConstraint {
  readonly mode: typeof blockContent
  readonly of: ReadonlyArray<string>
}

/** Declares that a node holds nested blocks, only of the named kinds. */
export const blocksOf = (...kinds: ReadonlyArray<string>): BlockConstraint =>
  Object.freeze({ mode: blockContent, of: [...kinds] })

/** A kind's declared content: a mode, or block content restricted to named kinds. */
export type ChildrenDeclaration = ContentMode | BlockConstraint

/**
 * The node shapes this version can declare: a `block` is one of the built-in
 * text blocks, an `atom` is an addressable node holding nothing (with optional
 * props), and an application `node` holds runs or nested blocks plus props its own
 * schema validates (§13).
 */
export type NodeDefinition =
  | { readonly name: string; readonly kind: 'block'; readonly children: 'text' }
  | {
      readonly name: string
      readonly kind: 'atom'
      readonly children: 'none'
      /** An atom's props decode at this boundary too, so an `Image` carries a source. */
      readonly props?: PropsSchema | undefined
    }
  | {
      readonly name: string
      readonly kind: 'node'
      /** `textContent` holds runs; `blockContent` or `blocksOf(…)` holds nested blocks. */
      readonly children: ChildrenDeclaration
      /** `none` forbids marks on this kind's runs, as a `CodeBlock` needs. */
      readonly marks: MarksPolicy
      /** Validates a `Node` block's `props` at this boundary, not in the codec. */
      readonly props?: PropsSchema | undefined
      /**
       * A boundary a lift never crosses: a table cell's content stays in the cell, where a
       * quote's or a list item's would be lifted out.
       */
      readonly isolating?: boolean | undefined
    }

/**
 * A declared application node, with the caller's name, prop schema, and content
 * mode kept in the type: the erasure to `any` happens only where heterogeneous
 * definitions are collected, not at the authoring call.
 */
export interface NodeDefinitionOf<
  Name extends string,
  Props extends PropsSchema | undefined,
  Children extends ChildrenDeclaration = typeof textContent,
> {
  readonly name: Name
  readonly kind: 'node'
  readonly children: Children
  readonly marks: MarksPolicy
  readonly props: Props
  readonly isolating: boolean
}

/** Declares a block node kind: a top-level node containing text runs. */
export const block = (name: string): NodeDefinition => ({
  name,
  kind: 'block',
  children: 'text',
})

/**
 * Declares an atom: an addressable node with no text content. Its optional props
 * decode at the same boundary as a `node`'s, so an `Image` is an atom carrying a
 * source rather than a run holder.
 */
export const atom = (
  name: string,
  options: { readonly Props?: PropsSchema | undefined } = {},
): NodeDefinition => ({ name, kind: 'atom', children: 'none', props: options.Props })

/**
 * Declares an application node kind: a `Node` block whose props this schema
 * validates and whose content the `children` declaration states — a mode, or block
 * content restricted to the kinds `blocksOf` names. `marks: 'none'` forbids marks on
 * its runs. The document codec keeps those props as JSON; the Kit is where an
 * application's types meet them.
 */
export const node = <
  const Name extends string,
  Props extends PropsSchema | undefined = undefined,
  Children extends ChildrenDeclaration = typeof textContent,
>(
  name: Name,
  options: {
    readonly Props?: Props
    readonly children?: Children
    readonly marks?: MarksPolicy
    /** A boundary a lift never crosses, as a table cell is. */
    readonly isolating?: boolean
  } = {},
): NodeDefinitionOf<Name, Props, Children> => ({
  name,
  kind: 'node',
  children: (options.children ?? textContent) as Children,
  marks: options.marks ?? 'all',
  props: options.Props as Props,
  isolating: options.isolating ?? false,
})

/**
 * The vocabulary one editor accepts: which node kinds and marks are available.
 * A Kit is a definition, never document state, and it never holds renderers or
 * executable code. Transforms and metadata arrive later.
 */
export interface Kit {
  readonly nodes: ReadonlyArray<NodeDefinition>
  /** Mark definitions, not just names: a Kit carries each mark's boundary policy. */
  readonly marks: ReadonlyArray<MarkDef>
}

export const kit = (definition: {
  readonly nodes: ReadonlyArray<NodeDefinition>
  readonly marks: ReadonlyArray<MarkDef>
}): Kit => Object.freeze({ nodes: [...definition.nodes], marks: [...definition.marks] })

export interface Diagnostic {
  readonly code:
    | 'UnknownNode'
    | 'UnsupportedNode'
    | 'UnknownMark'
    | 'InvalidProps'
    | 'MismatchedDefinition'
    | 'UnexpectedChild'
    | 'ForbiddenMark'
  readonly message: string
  readonly node?: NodeId
  readonly detail?: string
}

/** Whether a block is held as a built-in block or as an application node. */
const heldShape = (block: Block): 'block' | 'node' => (block.type === 'Node' ? 'node' : 'block')

/**
 * The content a block actually holds. An empty application node is `either`: the
 * document cannot say whether it is an atom or a run holder that happens to have
 * no runs, so a declaration of either kind agrees with it.
 */
const heldContent = (block: Block): 'text' | 'blocks' | 'either' => {
  if (block.type !== 'Node') return 'text'
  if (block.blocks !== undefined) return 'blocks'
  return block.children.length > 0 ? 'text' : 'either'
}

/** The content mode a declaration names, or `'none'` for an atom. */
const declaredContent = (definition: NodeDefinition): ContentMode | 'none' =>
  definition.kind === 'atom'
    ? 'none'
    : typeof definition.children === 'string'
      ? definition.children
      : blockContent

/**
 * Whether a declared definition agrees with the block it is declared for, and
 * why not. A `block` declaration expects a built-in block and a `node` or `atom`
 * one expects an application node; then the declared content mode must match what
 * the block holds, which is what makes an atom's no-children rule real.
 */
const definitionMismatch = (definition: NodeDefinition, block: Block): string | undefined => {
  const expected = definition.kind === 'block' ? 'block' : 'node'
  const held = heldShape(block)
  if (held !== expected) {
    return `"${definition.name}" is declared as ${definition.kind}, but the document holds it as ${held}`
  }
  const declared = declaredContent(definition)
  const content = heldContent(block)
  const agrees = content === 'either' ? declared !== 'blocks' : declared === content
  return agrees
    ? undefined
    : `"${definition.name}" is declared to hold ${declared}, but the document holds ${content}`
}

/**
 * A block's semantic kind: an application node's declared kind, a preserved node's
 * original type, or a built-in block's own type. This is what a `blocksOf`
 * constraint names, and what a `NodeRegistry` is looked up by.
 */
export const blockKind = (block: Block): string =>
  block.type === 'Node' ? block.kind : block.type === 'Unknown' ? block.originalType : block.type

/**
 * The children a constrained kind does not accept. A declaration without a
 * constraint accepts any block, and a block that holds runs has no children to
 * check; `definitionMismatch` is what reports the mode itself.
 */
const childKindDiagnostics = (
  definition: NodeDefinition,
  block: Block,
): ReadonlyArray<Diagnostic> => {
  if (definition.kind !== 'node' || typeof definition.children === 'string') return []
  if (block.type !== 'Node' || block.blocks === undefined) return []
  const allowed = definition.children.of
  const permitted = new Set(allowed)
  return block.blocks
    .filter(child => !permitted.has(blockKind(child)))
    .map(child => ({
      code: 'UnexpectedChild' as const,
      node: child.id,
      detail: blockKind(child),
      message: `"${block.kind}" accepts only ${allowed.join(', ')}`,
    }))
}

/** Structural summary of a Kit, for tooling and tests. */
export const inspectKit = (definition: Kit) => ({
  blocks: definition.nodes.filter(node => node.kind === 'block').length,
  atoms: definition.nodes.filter(node => node.kind === 'atom').length,
  nodes: definition.nodes.filter(node => node.kind === 'node').length,
  marks: definition.marks.length,
})

/**
 * The node vocabulary an edit may target, the way `MarkRegistry` is the mark
 * vocabulary a mark edit consults. `run` reads a kind's declaration from it to refuse
 * an edit a constraint forbids (§117, §125); `apply` still takes none, so a durable
 * transaction never depends on a vocabulary that may have moved.
 */
export interface NodeRegistry {
  /** The declaration for a block kind, or undefined when this vocabulary has none. */
  readonly definitionFor: (kind: string) => NodeDefinition | undefined
}

/** Builds the registry an edit consults. A later declaration for a name wins, as a Map does. */
export const nodeRegistry = (definitions: ReadonlyArray<NodeDefinition>): NodeRegistry => {
  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return Object.freeze({ definitionFor: (kind: string) => byName.get(kind) })
}

/**
 * Whether a mark's props decode against its declared schema, and why not. The
 * same stability rule as node props: only the verdict travels, not a schema's
 * message. A mark that declares props must carry them.
 */

/**
 * Checks a document against a Kit's vocabulary without changing it, walking
 * nested blocks so a container's children are checked too. Reports preserved
 * unknown blocks, known blocks the Kit does not declare, declarations that
 * disagree with how the document holds a block, application nodes whose props
 * their schema refuses, and marks outside the Kit or whose props their definition
 * refuses. Content diagnostics never strip or repair the document; callers decide
 * whether to block publishing or surface a placeholder.
 */
export const validate = (document: Document, definition: Kit): ReadonlyArray<Diagnostic> => {
  const byName = new Map(definition.nodes.map(node => [node.name, node]))
  const declaredMarks = new Map(definition.marks.map(mark => [mark.name, mark]))
  const diagnostics: Array<Diagnostic> = []
  eachBlock(document.children, block => {
    if (block.type === 'Unknown') {
      diagnostics.push({
        code: 'UnknownNode',
        node: block.id,
        detail: block.originalType,
        message: `Unimplemented node type "${block.originalType}"`,
      })
      return
    }
    const kind = blockKind(block)
    const declared = byName.get(kind)
    if (declared === undefined) {
      diagnostics.push({
        code: 'UnsupportedNode',
        node: block.id,
        detail: kind,
        message: `The Kit does not declare ${block.type === 'Node' ? 'node ' : ''}"${kind}"`,
      })
    } else {
      const mismatch = definitionMismatch(declared, block)
      if (mismatch !== undefined) {
        diagnostics.push({
          code: 'MismatchedDefinition',
          node: block.id,
          detail: kind,
          message: mismatch,
        })
      } else {
        if (
          block.type === 'Node' &&
          declared.kind !== 'block' &&
          propsFailure(declared.props, block.props)
        ) {
          diagnostics.push({
            code: 'InvalidProps',
            node: block.id,
            detail: kind,
            message: `"${kind}" props do not match its declared schema`,
          })
        }
        diagnostics.push(...childKindDiagnostics(declared, block))
      }
    }
    // A kind declared mark-free has no formatting to carry, so any mark it does is
    // reported as well as checked against the vocabulary that declared it.
    const forbidsMarks = declared?.kind === 'node' && declared.marks === 'none'
    for (const run of block.children) {
      for (const mark of run.marks) {
        const name = markName(mark)
        if (forbidsMarks) {
          diagnostics.push({
            code: 'ForbiddenMark',
            node: run.id,
            detail: name,
            message: `"${kind}" accepts no marks`,
          })
        }
        const declaredMark = declaredMarks.get(name)
        if (declaredMark === undefined) {
          diagnostics.push({
            code: 'UnknownMark',
            node: run.id,
            detail: name,
            message: `The Kit does not declare mark "${name}"`,
          })
        } else if (propsFailure(declaredMark.Props, markProps(mark))) {
          diagnostics.push({
            code: 'InvalidProps',
            node: run.id,
            detail: name,
            message: `"${name}" props do not match its declared schema`,
          })
        }
      }
    }
  })
  return diagnostics
}
