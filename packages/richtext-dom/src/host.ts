/**
 * The host-element mount (§118): the bridge between a Foldkit view and the owned
 * subtree. A view renders a host element and mounts the interpreter into it once;
 * a patch Command later finds the attachment through that element, so a DOM
 * reference never has to enter a Model.
 */
import type * as RichText from 'foldkit-richtext'
import { mount } from './index.js'
import { attach, type AttachOptions, type Attachment } from './events.js'

const attachments = new WeakMap<Element, Attachment>()

/**
 * Renders `content` into `host` and records the attachment. The host is the
 * view's element; the subtree the interpreter creates goes inside it, and the
 * interpreter owns everything below.
 */
export const mountInto = (
  host: Element,
  content: RichText.Document,
  options: AttachOptions,
): Attachment => {
  // A mount runs once per element, so this is defensive: a remount replaces the
  // subtree rather than leaving two.
  releaseMount(host)
  const dom = mount(host.ownerDocument, content)
  host.append(dom.root)
  const attachment = attach(dom, options)
  attachments.set(host, attachment)
  return attachment
}

/** The attachment a host owns, for a patch Command that has only the element. */
export const attachmentIn = (host: Element): Attachment | undefined => attachments.get(host)

/** Detaches a host's listeners and removes its subtree. Safe to call twice. */
export const releaseMount = (host: Element): void => {
  const attachment = attachments.get(host)
  if (attachment === undefined) return
  attachments.delete(host)
  attachment.detach()
  attachment.current().root.remove()
}
