/**
 * One reading of drawn markup for every drawer. A live DOM, a server string
 * parsed back, and Scene's VNode each become the same indented text: the
 * elements, their attributes, the values form fields hold, and the text, so
 * two drawers agree exactly when their texts are equal.
 *
 * Attributes are sorted and classes and style declarations put in order, since
 * no drawer promises an order for either. A field's value and a box's checked
 * state are read from the element's properties, not its attributes: the
 * runtime sets the property, the server writes the attribute, and what a
 * person sees is the property. Adjacent texts are joined and empty ones and
 * comments dropped, since a parser does the same to a server's string.
 */
import type { Html } from 'foldkit/html'

type VNode = Exclude<Html, null>

const isField = (element: Element): element is HTMLInputElement => element.localName === 'input'

const holdsValue = (
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  element.localName === 'input' ||
  element.localName === 'textarea' ||
  element.localName === 'select'

/** What a field shows rather than what its markup says. */
const stateOf = (element: Element): ReadonlyArray<readonly [string, string]> => {
  if (!holdsValue(element)) return []
  const value: ReadonlyArray<readonly [string, string]> = [['value', element.value]]
  return isField(element) && (element.type === 'checkbox' || element.type === 'radio')
    ? [...value, ['checked', String(element.checked)]]
    : value
}

/** Attribute names the state above replaces. */
const replacedBy = (element: Element, name: string): boolean =>
  (holdsValue(element) && (name === 'value' || name === 'checked')) ||
  (element.localName === 'option' && name === 'selected')

const styleOf = (element: Element): string => {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return ''
  const declarations: Array<string> = []
  for (let index = 0; index < element.style.length; index++) {
    const name = element.style.item(index)
    declarations.push(`${name}: ${element.style.getPropertyValue(name)}`)
  }
  return declarations.sort().join('; ')
}

const attributesOf = (element: Element): string => {
  const entries: Array<readonly [string, string]> = []
  for (const { name, value } of Array.from(element.attributes)) {
    if (name === 'class' || name === 'style' || replacedBy(element, name)) continue
    entries.push([name, value])
  }
  const classes = Array.from(element.classList).sort().join(' ')
  if (classes !== '') entries.push(['class', classes])
  const style = styleOf(element)
  if (style !== '') entries.push(['style', style])
  entries.push(...stateOf(element))
  return entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
    .join('')
}

const describe = (element: Element, depth: number, lines: Array<string>): void => {
  const pad = '  '.repeat(depth)
  lines.push(`${pad}<${element.localName}${attributesOf(element)}>`)
  // A textarea's text is its value, read above.
  if (element.localName === 'textarea') return
  let text = ''
  const flush = () => {
    if (text !== '') lines.push(`${pad}  ${JSON.stringify(text)}`)
    text = ''
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === child.TEXT_NODE) text += child.textContent ?? ''
    else if (child instanceof Element) {
      flush()
      describe(child, depth + 1, lines)
    }
  }
  flush()
}

/** The canonical text of an element and everything in it. */
export const ofElement = (element: Element): string => {
  const lines: Array<string> = []
  describe(element, 0, lines)
  return lines.join('\n')
}

/** The canonical text of the first element a server's markup parses to, in a document's body. */
export const ofServedMarkup = (html: string): string => {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    'text/html',
  )
  const root = parsed.body.firstElementChild
  if (root === null) throw new Error(`the served markup holds no element: ${html}`)
  return ofElement(root)
}

const tagOf = (
  sel: string,
): { readonly tag: string; readonly id: string; readonly classes: ReadonlyArray<string> } => {
  const [head = '', ...rest] = sel.split('.')
  const [tag = '', id = ''] = head.split('#')
  return { tag, id, classes: rest }
}

/**
 * Builds an element from a VNode's description, as Scene reads it: its
 * attributes, properties, classes, style and dataset, with no hooks and no
 * listeners. Properties are set after the children, so a `select`'s value
 * finds its options.
 */
const build = (node: VNode | string, into: Document): Node => {
  if (typeof node === 'string') return into.createTextNode(node)
  if (node.sel === undefined) return into.createTextNode(node.text ?? '')
  if (node.sel === '!') return into.createComment(node.text ?? '')
  const { tag, id, classes } = tagOf(node.sel)
  const data = node.data
  const element =
    data?.ns === undefined ? into.createElement(tag) : into.createElementNS(data.ns, tag)
  if (id !== '') element.id = id
  for (const name of classes) element.classList.add(name)
  for (const [name, value] of Object.entries(data?.attrs ?? {})) {
    if (value === false) continue
    element.setAttribute(name, value === true ? '' : String(value))
  }
  for (const [name, on] of Object.entries(data?.class ?? {})) {
    if (on) element.classList.add(name)
  }
  if (element instanceof HTMLElement || element instanceof SVGElement) {
    for (const [name, value] of Object.entries(data?.style ?? {})) {
      if (typeof value !== 'string') continue
      if (name.startsWith('--')) element.style.setProperty(name, value)
      else Reflect.set(element.style, name, value)
    }
    for (const [name, value] of Object.entries(data?.dataset ?? {})) {
      element.dataset[name] = value
    }
  }
  const children = node.children ?? (node.text === undefined ? [] : [node.text])
  for (const child of children) element.appendChild(build(child, into))
  for (const [name, value] of Object.entries(data?.props ?? {})) Reflect.set(element, name, value)
  return element
}

/** The canonical text of what a VNode describes. */
export const ofVNode = (node: VNode): string => {
  const built = build(node, document)
  if (!(built instanceof Element)) throw new Error('the view drew no element at its root')
  return ofElement(built)
}
