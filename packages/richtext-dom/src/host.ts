/**
 * The host-element mount (§118): the bridge between a Foldkit view and the owned
 * subtree. A view renders a host element and mounts the interpreter into it once;
 * a patch Command later finds the attachment through that element, so a DOM
 * reference never has to enter a Model.
 */
import * as RichText from 'foldkit-richtext'
import { mount } from './index.js'
import { attach, type AttachOptions, type Attachment, type Decorate } from './events.js'

const attachments = new WeakMap<Element, Attachment>()
const renderings = new Map<string, RichText.Rendering>()
const vocabularies = new Map<string, Vocabulary>()

/**
 * The vocabulary an editor resolves edits against: the mark and node registries `run`
 * consults to refuse an edit a declaration forbids (§125). Both are optional, and a
 * field left out leaves `run`'s defaults in place.
 */
export interface Vocabulary {
  readonly marks?: RichText.MarkRegistry | undefined
  readonly nodes?: RichText.NodeRegistry | undefined
}

/**
 * Records the vocabulary a placement's editor resolves against, by host id, for the same
 * reason a rendering registry is: it holds schemas and functions, so it cannot ride in a
 * Bundle's schema-decoded args (§122). Re-placing an id replaces what it had.
 */
export const placeVocabulary = (hostId: string, vocabulary: Vocabulary): void => {
  vocabularies.set(hostId, vocabulary)
}

/** The vocabulary placed for a host id, or none — `run` then uses its own defaults. */
export const vocabularyFor = (hostId: string): Vocabulary => vocabularies.get(hostId) ?? {}

const decorators = new Map<string, Decorate>()

/**
 * Records what a placement's editor draws over its document, by host id, for the reason a
 * rendering registry is placed: a function cannot ride in the Bundle's schema-decoded args.
 */
export const placeDecorations = (hostId: string, decorate: Decorate): void => {
  decorators.set(hostId, decorate)
}

/** What is drawn over a host's document, or nothing when none was placed. */
export const decorationsFor = (hostId: string): Decorate => decorators.get(hostId) ?? (() => [])

const ruleSets = new Map<string, ReadonlyArray<RichText.InputRule>>()

/**
 * Records the input rules a placement's editor applies to what is typed, by host id, for
 * the same reason a vocabulary is placed: a rule holds a function, so it cannot ride in the
 * Bundle's schema-decoded args (§124 §4). The editor itself carries no syntax; an
 * application places the rules it wants, such as `markdownInputRules`.
 */
export const placeInputRules = (hostId: string, rules: ReadonlyArray<RichText.InputRule>): void => {
  ruleSets.set(hostId, rules)
}

/** The rules placed for a host id, or none — typing is then only an insertion. */
export const inputRulesFor = (hostId: string): ReadonlyArray<RichText.InputRule> =>
  ruleSets.get(hostId) ?? []

/**
 * Records how a placement's host id renders (§122). A registry holds functions,
 * so it cannot ride in a Bundle's args or Model; it is placed by host id because
 * a view is placed before its element exists, and the mount looks it up with the
 * id it renders. Re-placing an id replaces what it had.
 */
export const placeRendering = (hostId: string, rendering: RichText.Rendering): void => {
  renderings.set(hostId, rendering)
}

/** The registry placed for a host id, or the default when none was placed. */
export const renderingFor = (hostId: string): RichText.Rendering =>
  renderings.get(hostId) ?? RichText.noRendering

/**
 * Renders `content` into `host` and records the attachment. The host is the
 * view's element; the subtree the interpreter creates goes inside it, and the
 * interpreter owns everything below. A rendering registry decides how a declared
 * mark or node kind renders, and the same one is kept for later patches.
 */
export const mountInto = (
  host: Element,
  content: RichText.Document,
  options: AttachOptions,
  rendering: RichText.Rendering = RichText.noRendering,
): Attachment => {
  // A mount runs once per element, so this is defensive: a remount replaces the
  // subtree rather than leaving two.
  releaseMount(host)
  const dom = mount(host.ownerDocument, content, rendering, options.decorate?.(content))
  host.append(dom.root)
  const attachment = attach(dom, options)
  attachments.set(host, attachment)
  return attachment
}

/** The attachment a host owns, for a patch Command that has only the element. */
export const attachmentIn = (host: Element): Attachment | undefined => attachments.get(host)

/**
 * Detaches a host's listeners and removes its subtree. Safe to call twice. What a
 * placement recorded is not forgotten here: it belongs to the host id the view's
 * author placed, not to one mount of it, so a host that unmounts and mounts again
 * (a route returning, a row re-rendered) renders the same way it did (§122).
 */
export const releaseMount = (host: Element): void => {
  const attachment = attachments.get(host)
  if (attachment === undefined) return
  attachments.delete(host)
  attachment.detach()
  attachment.current().root.remove()
}
