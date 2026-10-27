/**
 * A Mermaid fence drawn as a diagram. Pele lays it out when the site is built,
 * and its SVG is drawn with the inert builder, element by element, so a page
 * carries the drawing and no script: Pele never reaches a browser. Its colours
 * read `--pele-*` variables, which the article's style sets from the theme.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'
import { render } from 'pele'

type Ih = HtmlBuilder<never>
type Node = DefaultTreeAdapterTypes.ChildNode

const XMLNS = 'http://www.w3.org/2000/xmlns/'

/** The elements Pele draws, each to the builder that draws it. */
const elements = {
  svg: (ih: Ih) => ih.svg,
  g: (ih: Ih) => ih.g,
  path: (ih: Ih) => ih.path,
  rect: (ih: Ih) => ih.rect,
  text: (ih: Ih) => ih.text,
  tspan: (ih: Ih) => ih.tspan,
}

/** A name the parser read from Pele's output: an own key, never `constructor`. */
const drawable = (tag: string): tag is keyof typeof elements => Object.hasOwn(elements, tag)

const draw = (ih: Ih, node: Node): Html | string | undefined => {
  if (node.nodeName === '#text' && 'value' in node) return node.value
  if (!('tagName' in node)) return undefined
  if (!drawable(node.tagName))
    throw new Error(`Pele drew a <${node.tagName}>, which the site cannot draw`)
  return elements[node.tagName](ih)(
    node.attrs
      // The namespace is the element's own; a declaration of it is no attribute to set.
      .filter(attribute => attribute.namespace !== XMLNS)
      .map(({ prefix, name, value }) =>
        ih.Attribute(prefix === undefined || prefix === '' ? name : `${prefix}:${name}`, value),
      ),
    node.childNodes.flatMap(child => draw(ih, child) ?? []),
  )
}

/** The diagram a fence describes, and its width as laid out; none where Pele cannot read it. */
export const diagram = (
  ih: Ih,
  source: string,
): Option.Option<{ readonly drawn: Html; readonly width: number }> =>
  Option.flatMap(Option.liftThrowable(render)(source), ({ svg, width }) =>
    Option.map(
      Option.fromUndefinedOr(
        parseFragment(svg)
          .childNodes.map(node => draw(ih, node))
          .find((drawn): drawn is Html => typeof drawn === 'object'),
      ),
      drawn => ({ drawn, width }),
    ),
  )
