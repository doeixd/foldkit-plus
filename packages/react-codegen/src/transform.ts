import ts from 'typescript'
import { printFile, printWithSourceMap } from './print.js'
import { TAGS } from './tags.js'

const f = ts.factory

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly fileName: string
  readonly line: number
  readonly column: number
}

export interface TransformOptions {
  /** Also produce a source map from the output back to `fileName`. */
  readonly sourceMap?: boolean
}

export type TransformResult =
  | {
      readonly ok: true
      readonly code: string
      /** Source map JSON, present when `sourceMap` was requested. `sources` is `[fileName]`. */
      readonly map?: string
      readonly diagnostics: readonly []
    }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> }

export const DiagnosticCode = {
  UnsupportedBuilder: 'FKREACT0001',
  UnsupportedAttribute: 'FKREACT0002',
  DynamicAttributes: 'FKREACT0003',
  EscapedBuilder: 'FKREACT0004',
  UnsupportedAttributeArgument: 'FKREACT0005',
  LazySlot: 'FKREACT0006',
} as const

/** Foldkit attributes that are the same DOM attribute or property under a React prop name. */
const PROPS: Readonly<Record<string, string>> = {
  Key: 'key',
  Class: 'className',
  Id: 'id',
  Title: 'title',
  Lang: 'lang',
  Dir: 'dir',
  Hidden: 'hidden',
  Tabindex: 'tabIndex',
  Value: 'value',
  Checked: 'checked',
  Selected: 'selected',
  Open: 'open',
  Placeholder: 'placeholder',
  Name: 'name',
  Disabled: 'disabled',
  Readonly: 'readOnly',
  Required: 'required',
  Autofocus: 'autoFocus',
  Multiple: 'multiple',
  Type: 'type',
  Pattern: 'pattern',
  Maxlength: 'maxLength',
  Minlength: 'minLength',
  Min: 'min',
  Max: 'max',
  Step: 'step',
  Rows: 'rows',
  Cols: 'cols',
  For: 'htmlFor',
  Href: 'href',
  Src: 'src',
  Alt: 'alt',
  Target: 'target',
  Rel: 'rel',
  Role: 'role',
  Width: 'width',
  Height: 'height',
  ViewBox: 'viewBox',
  Xmlns: 'xmlns',
  Fill: 'fill',
  Stroke: 'stroke',
  StrokeWidth: 'strokeWidth',
  D: 'd',
  Cx: 'cx',
  Cy: 'cy',
  R: 'r',
  X: 'x',
  Y: 'y',
  Points: 'points',
  Transform: 'transform',
  Opacity: 'opacity',
}

/** Foldkit events that dispatch a fixed Message, by React handler name. */
const MESSAGE_EVENTS: Readonly<Record<string, string>> = {
  OnClick: 'onClick',
  OnDoubleClick: 'onDoubleClick',
  OnMouseDown: 'onMouseDown',
  OnMouseUp: 'onMouseUp',
  OnMouseEnter: 'onMouseEnter',
  OnMouseLeave: 'onMouseLeave',
  OnMouseOver: 'onMouseOver',
  OnMouseOut: 'onMouseOut',
  OnMouseMove: 'onMouseMove',
  OnFocus: 'onFocus',
  OnBlur: 'onBlur',
}

const DISPATCH = 'dispatch'

/** Points a synthesized node's source map entry at the syntax it replaces. */
const withSourceOf = <T extends ts.Node>(node: T, original: ts.Node): T =>
  ts.setSourceMapRange(ts.setOriginalNode(node, original), original)

const reactNodeType = () => f.createTypeReferenceNode('ReactNode')

const kebabToCamel = (name: string) =>
  name.startsWith('--')
    ? name
    : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

// ARIA attribute names are one lowercase word: AriaLabelledBy is aria-labelledby.
const ariaName = (name: string) => `aria-${name.slice('Aria'.length).toLowerCase()}`

const isBuilderParameter = (parameter: ts.ParameterDeclaration) =>
  parameter.type !== undefined &&
  ts.isTypeReferenceNode(parameter.type) &&
  ts.isIdentifier(parameter.type.typeName) &&
  parameter.type.typeName.text === 'HtmlBuilder' &&
  ts.isIdentifier(parameter.name)

type ViewFunction = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

const isViewFunction = (node: ts.Node): node is ViewFunction =>
  (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
  node.parameters.some(isBuilderParameter)

/** A view function, the parameter that receives the builder, and its Message type. */
interface ViewSite {
  readonly view: ViewFunction
  readonly node: ts.Node
  readonly builderParameter: ts.ParameterDeclaration
  readonly messageType: ts.TypeNode | undefined
  /** Types for untyped parameters, by position, that the removed `defineView` call supplied. */
  readonly parameterTypes: ReadonlyArray<ts.TypeNode | undefined>
}

const annotatedView = (node: ts.Node): ViewSite | undefined => {
  if (!isViewFunction(node)) return undefined
  const builderParameter = node.parameters.find(isBuilderParameter)!
  return {
    view: node,
    node,
    builderParameter,
    messageType: (builderParameter.type as ts.TypeReferenceNode).typeArguments?.[0],
    parameterTypes: [],
  }
}

/**
 * `Submodel.defineView<Model, Message>((model, h) => …)`, whose builder is the
 * untyped last parameter. The call becomes the compiled function; the brand
 * only exists for `h.submodel`'s type check.
 */
const definedView = (node: ts.Node): ViewSite | undefined => {
  if (!ts.isCallExpression(node) || node.arguments.length !== 1) return undefined
  const callee = node.expression
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined
  const view = node.arguments[0]!
  if (name !== 'defineView' || !(ts.isArrowFunction(view) || ts.isFunctionExpression(view))) {
    return undefined
  }
  const builderParameter = view.parameters.at(-1)
  if (builderParameter === undefined || !ts.isIdentifier(builderParameter.name)) return undefined
  const [model, message, viewInputs] = node.typeArguments ?? []
  return {
    view,
    node,
    builderParameter,
    messageType: message,
    parameterTypes: view.parameters.length === 3 ? [model, viewInputs] : [model],
  }
}

const viewSite = (node: ts.Node) => annotatedView(node) ?? definedView(node)

/** Local names of the named imports from `module`, keyed by imported name. */
const importedNames = (file: ts.SourceFile, module: string) => {
  const names = new Map<string, string>()
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === module &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        names.set((element.propertyName ?? element.name).text, element.name.text)
      }
    }
  }
  return names
}

/**
 * Compiles every Foldkit view function in a module (any function with an
 * `HtmlBuilder` parameter) to a function returning React elements, taking
 * `dispatch` where it took `h`. Fails with diagnostics rather than emitting
 * code for a construct it cannot translate with the same meaning.
 */
export const transformSourceFile = (
  fileName: string,
  sourceText: string,
  options: TransformOptions = {},
): TransformResult => {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const diagnostics: Array<Diagnostic> = []
  const htmlImports = importedNames(source, 'foldkit/html')
  const htmlName = htmlImports.get('Html')
  const lazyFactories = new Map(
    ['createLazy', 'createKeyedLazy'].flatMap(imported => {
      const local = htmlImports.get(imported)
      return local === undefined ? [] : [[local, imported === 'createKeyedLazy'] as const]
    }),
  )
  // Memoization slots (`const rowSlot = createLazy()`), by whether they are keyed.
  const slots = new Map<string, boolean>()
  const findSlots = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      lazyFactories.has(node.initializer.expression.text) &&
      node.initializer.arguments.length === 0
    ) {
      slots.set(node.name.text, lazyFactories.get(node.initializer.expression.text)!)
    }
    ts.forEachChild(node, findSlots)
  }
  findSlots(source)
  const isHtmlType = (node: ts.Node) =>
    htmlName !== undefined &&
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === htmlName
  const report = (node: ts.Node, code: string, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
    diagnostics.push({ code, message, fileName, line: line + 1, column: character + 1 })
  }
  let converted = false

  const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
    const slotCall = (node: ts.Node | undefined) =>
      node !== undefined &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      slots.has(node.expression.text)
        ? node
        : undefined

    /** `slot(view, args)` or `keyedSlot(key, view, args)` becomes `view(...args)`: memoization changes no output. */
    const lowerSlot = (call: ts.CallExpression, visitor: (node: ts.Node) => ts.Node) => {
      const keyed = slots.get((call.expression as ts.Identifier).text)!
      const [view, args] = keyed ? call.arguments.slice(1) : call.arguments
      if (view === undefined || args === undefined || call.arguments.length !== (keyed ? 3 : 2)) {
        report(
          call,
          DiagnosticCode.LazySlot,
          keyed
            ? 'A createKeyedLazy slot is called as slot(key, view, args).'
            : 'A createLazy slot is called as slot(view, args).',
        )
        return call
      }
      return withSourceOf(
        f.createCallExpression(
          visitor(view) as ts.Expression,
          undefined,
          ts.isArrayLiteralExpression(args)
            ? args.elements.map(element => visitor(element) as ts.Expression)
            : [f.createSpreadElement(visitor(args) as ts.Expression)],
        ),
        call,
      )
    }

    /** Reports a slot or lazy factory used other than as `const slot = createLazy()` and `slot(...)`. */
    const isEscapedLazy = (node: ts.Node) => {
      if (!ts.isIdentifier(node) || !(slots.has(node.text) || lazyFactories.has(node.text))) {
        return false
      }
      const parent = node.parent
      if (ts.isImportSpecifier(parent)) return false
      report(
        node,
        DiagnosticCode.LazySlot,
        `${node.text} can only be declared as \`const slot = ${lazyFactories.has(node.text) ? node.text : 'createLazy'}()\` and called directly; other uses cannot be compiled.`,
      )
      return true
    }

    const visitView = (site: ViewSite): ts.Node => {
      const { view, builderParameter } = site
      const builder = (builderParameter.name as ts.Identifier).text
      converted = true
      const dispatchCall = (message: ts.Expression) =>
        f.createCallExpression(f.createIdentifier(DISPATCH), undefined, [message])

      /** `h.submodel({ model, view, toParentMessage })`: call the child view with a lifting dispatch. */
      const submodel = (node: ts.CallExpression): ts.Node => {
        const config = node.arguments[0]
        const refuse = (at: ts.Node, message: string) => {
          report(at, DiagnosticCode.UnsupportedBuilder, message)
          return node
        }
        if (
          node.arguments.length !== 1 ||
          config === undefined ||
          !ts.isObjectLiteralExpression(config)
        ) {
          return refuse(node, `${builder}.submodel needs an object literal config to be compiled.`)
        }
        const fields = new Map<string, ts.Expression>()
        for (const property of config.properties) {
          if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
            fields.set(property.name.text, property.initializer)
          } else if (ts.isShorthandPropertyAssignment(property)) {
            fields.set(property.name.text, property.name)
          } else {
            return refuse(
              property,
              `${builder}.submodel config entries must be plain \`name: value\` properties.`,
            )
          }
        }
        const unknown = [...fields.keys()].find(
          key => !['slotId', 'model', 'view', 'toParentMessage', 'viewInputs'].includes(key),
        )
        if (unknown !== undefined) {
          return refuse(
            config,
            `${builder}.submodel config field '${unknown}' has no React translation.`,
          )
        }
        const childView = fields.get('view')
        const model = fields.get('model')
        const toParentMessage = fields.get('toParentMessage')
        if (!childView || !model || !toParentMessage) {
          return refuse(config, `${builder}.submodel needs view, model, and toParentMessage.`)
        }
        const viewInputs = fields.get('viewInputs')
        // slotId only names the Foldkit boundary; the lifting dispatch is the whole boundary here.
        const lift = f.createArrowFunction(
          undefined,
          undefined,
          [f.createParameterDeclaration(undefined, undefined, 'submodelMessage')],
          undefined,
          f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          dispatchCall(
            f.createCallExpression(
              f.createParenthesizedExpression(visit(toParentMessage) as ts.Expression),
              undefined,
              [f.createIdentifier('submodelMessage')],
            ),
          ),
        )
        const callee = visit(childView) as ts.Expression
        return withSourceOf(
          f.createCallExpression(
            ts.isIdentifier(callee) || ts.isPropertyAccessExpression(callee)
              ? callee
              : f.createParenthesizedExpression(callee),
            undefined,
            [
              visit(model) as ts.Expression,
              ...(viewInputs === undefined ? [] : [visit(viewInputs) as ts.Expression]),
              lift,
            ],
          ),
          node,
        )
      }

      const attribute = (node: ts.Expression): ts.JsxAttribute | undefined => {
        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression) ||
          !ts.isIdentifier(node.expression.expression) ||
          node.expression.expression.text !== builder
        ) {
          report(
            node,
            DiagnosticCode.DynamicAttributes,
            `Write each attribute inline as ${builder}.Name(...): a computed attribute cannot be lowered to a JSX prop.`,
          )
          return undefined
        }
        const name = node.expression.name.text
        const args = node.arguments.map(argument => visit(argument) as ts.Expression)
        const prop = (propName: string, value: ts.Expression) =>
          withSourceOf(
            f.createJsxAttribute(
              f.createIdentifier(propName),
              f.createJsxExpression(undefined, value),
            ),
            node,
          )
        const handler = (body: ts.ConciseBody, parameter?: string) =>
          f.createArrowFunction(
            undefined,
            undefined,
            parameter === undefined
              ? []
              : [f.createParameterDeclaration(undefined, undefined, parameter)],
            undefined,
            f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            body,
          )
        const mapped = PROPS[name]
        if (mapped !== undefined && args.length === 1) return prop(mapped, args[0]!)
        if (name.startsWith('Aria') && name.length > 4 && args.length === 1) {
          return prop(ariaName(name), args[0]!)
        }
        const event = MESSAGE_EVENTS[name]
        if (event !== undefined) {
          if (args.length !== 1) {
            report(
              node,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.${name} with options has no React equivalent yet; pass only the Message.`,
            )
            return undefined
          }
          return prop(event, handler(dispatchCall(args[0]!)))
        }
        if ((name === 'OnKeyDown' || name === 'OnKeyUp') && args.length === 1) {
          const event = f.createIdentifier('event')
          const modifiers = f.createObjectLiteralExpression(
            ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'].map(modifier =>
              f.createPropertyAssignment(
                modifier,
                f.createPropertyAccessExpression(event, modifier),
              ),
            ),
          )
          return prop(
            name === 'OnKeyDown' ? 'onKeyDown' : 'onKeyUp',
            handler(
              dispatchCall(
                f.createCallExpression(f.createParenthesizedExpression(args[0]!), undefined, [
                  f.createPropertyAccessExpression(event, 'key'),
                  modifiers,
                ]),
              ),
              'event',
            ),
          )
        }
        if (name === 'OnInput' && args.length === 1) {
          // React's onChange on a text control is the native input event, and keeps a controlled value warning-free.
          const value = f.createPropertyAccessExpression(
            f.createPropertyAccessExpression(f.createIdentifier('event'), 'currentTarget'),
            'value',
          )
          return prop(
            'onChange',
            handler(
              dispatchCall(
                f.createCallExpression(f.createParenthesizedExpression(args[0]!), undefined, [
                  value,
                ]),
              ),
              'event',
            ),
          )
        }
        if (name === 'OnSubmit' && args.length === 1) {
          const preventDefault = f.createExpressionStatement(
            f.createCallExpression(
              f.createPropertyAccessExpression(f.createIdentifier('event'), 'preventDefault'),
              undefined,
              [],
            ),
          )
          return prop(
            'onSubmit',
            handler(
              f.createBlock(
                [preventDefault, f.createExpressionStatement(dispatchCall(args[0]!))],
                true,
              ),
              'event',
            ),
          )
        }
        if ((name === 'Attribute' || name === 'DataAttribute') && args.length === 2) {
          const key = node.arguments[0]!
          if (!ts.isStringLiteralLike(key)) {
            report(
              key,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.${name} needs a string literal name to become a JSX prop.`,
            )
            return undefined
          }
          const propName = name === 'DataAttribute' ? `data-${key.text}` : key.text
          return prop(propName, args[1]!)
        }
        if (name === 'Style' && args.length === 1) {
          const style = node.arguments[0]!
          if (!ts.isObjectLiteralExpression(style)) {
            report(
              style,
              DiagnosticCode.UnsupportedAttributeArgument,
              `${builder}.Style needs an object literal, so its CSS property names can be converted for React.`,
            )
            return undefined
          }
          const properties: Array<ts.ObjectLiteralElementLike> = []
          for (const property of style.properties) {
            if (
              !ts.isPropertyAssignment(property) ||
              !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ) {
              report(
                property,
                DiagnosticCode.UnsupportedAttributeArgument,
                `${builder}.Style properties must be plain \`name: value\` entries.`,
              )
              return undefined
            }
            const cssName = kebabToCamel(property.name.text)
            properties.push(
              f.createPropertyAssignment(
                /^[A-Za-z_$][\w$]*$/.test(cssName)
                  ? f.createIdentifier(cssName)
                  : f.createStringLiteral(cssName),
                visit(property.initializer) as ts.Expression,
              ),
            )
          }
          return prop('style', f.createObjectLiteralExpression(properties))
        }
        report(
          node,
          DiagnosticCode.UnsupportedAttribute,
          `${builder}.${name} cannot be compiled to standalone React JSX. Use foldkit-react's runtime interop, or write this element in React.`,
        )
        return undefined
      }

      const child = (node: ts.Expression): ts.JsxChild => {
        if (
          ts.isStringLiteralLike(node) &&
          // JSX text decodes entities, so text containing `&` stays a string expression.
          !/[{}<>&]/.test(node.text) &&
          node.text.trim() === node.text
        ) {
          return f.createJsxText(node.text)
        }
        const call = elementCall(node)
        if (call !== undefined) return element(call)
        if (ts.isSpreadElement(node))
          return f.createJsxExpression(undefined, visit(node.expression) as ts.Expression)
        return f.createJsxExpression(undefined, visit(node) as ts.Expression)
      }

      const isBuilderAccess = (node: ts.Node): node is ts.PropertyAccessExpression =>
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === builder

      interface ElementCall {
        readonly tag: string
        readonly key: ts.Expression | undefined
        readonly arguments: ReadonlyArray<ts.Expression>
        readonly node: ts.CallExpression
      }

      /** `h.div(attributes, children)`, or `h.keyed('li')(key, attributes, children)`. */
      const elementCall = (node: ts.Node): ElementCall | undefined => {
        if (!ts.isCallExpression(node)) return undefined
        if (isBuilderAccess(node.expression) && TAGS.has(node.expression.name.text)) {
          return { tag: node.expression.name.text, key: undefined, arguments: node.arguments, node }
        }
        const factory = node.expression
        if (
          ts.isCallExpression(factory) &&
          isBuilderAccess(factory.expression) &&
          factory.expression.name.text === 'keyed' &&
          factory.arguments.length === 1 &&
          ts.isStringLiteralLike(factory.arguments[0]!) &&
          TAGS.has(factory.arguments[0].text)
        ) {
          const [key, ...rest] = node.arguments
          return key === undefined
            ? undefined
            : { tag: factory.arguments[0].text, key, arguments: rest, node }
        }
        return undefined
      }

      const element = ({
        tag,
        key,
        arguments: [attributesArgument, childrenArgument],
        node,
      }: ElementCall): ts.JsxElement | ts.JsxSelfClosingElement => {
        const attributes: Array<ts.JsxAttribute> = []
        if (key !== undefined) {
          attributes.push(
            f.createJsxAttribute(
              f.createIdentifier('key'),
              f.createJsxExpression(undefined, visit(key) as ts.Expression),
            ),
          )
        }
        if (attributesArgument !== undefined) {
          if (ts.isArrayLiteralExpression(attributesArgument)) {
            for (const entry of attributesArgument.elements) {
              const lowered = attribute(entry)
              if (lowered) attributes.push(lowered)
            }
          } else {
            report(
              attributesArgument,
              DiagnosticCode.DynamicAttributes,
              `Pass ${builder}.${tag}'s attributes as an array literal so each can be lowered to a JSX prop.`,
            )
          }
        }
        const children =
          childrenArgument === undefined
            ? []
            : ts.isArrayLiteralExpression(childrenArgument)
              ? childrenArgument.elements.map(child)
              : [f.createJsxExpression(undefined, visit(childrenArgument) as ts.Expression)]
        const name = f.createIdentifier(tag)
        const props = f.createJsxAttributes(attributes)
        return withSourceOf(
          children.length === 0
            ? f.createJsxSelfClosingElement(name, undefined, props)
            : f.createJsxElement(
                f.createJsxOpeningElement(name, undefined, props),
                children,
                f.createJsxClosingElement(name),
              ),
          node,
        )
      }

      const visit = (node: ts.Node): ts.Node => {
        if (isHtmlType(node)) return reactNodeType()
        const nested = viewSite(node)
        if (nested !== undefined && nested.view !== view) return visitView(nested)
        const slot = slotCall(node)
        if (slot !== undefined) return lowerSlot(slot, visit)
        if (
          ts.isCallExpression(node) &&
          isBuilderAccess(node.expression) &&
          node.expression.name.text === 'submodel'
        ) {
          return submodel(node)
        }
        if (isEscapedLazy(node)) return node
        const call = elementCall(node)
        if (call !== undefined) return f.createParenthesizedExpression(element(call))
        if (
          isBuilderAccess(node) &&
          node.name.text === 'empty' &&
          !ts.isCallExpression(node.parent)
        ) {
          return withSourceOf(f.createNull(), node)
        }
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === builder
        ) {
          const name = node.expression.name.text
          report(
            node,
            /^[A-Z]/.test(name)
              ? DiagnosticCode.DynamicAttributes
              : DiagnosticCode.UnsupportedBuilder,
            /^[A-Z]/.test(name)
              ? `${builder}.${name} is only supported inline in an element's attribute array.`
              : `${builder}.${name} cannot be compiled to standalone React JSX. Use foldkit-react's runtime interop, or write this part in React.`,
          )
          return node
        }
        if (ts.isIdentifier(node) && node.text === builder) {
          const parent = node.parent
          const passedToView =
            (ts.isCallExpression(parent) && parent.arguments.includes(node)) ||
            // A memoized helper receives the builder in its slot's args array.
            (ts.isArrayLiteralExpression(parent) &&
              slotCall(parent.parent)?.arguments.at(-1) === parent)
          if (passedToView) {
            // A helper view receives dispatch in place of the builder.
            return withSourceOf(f.createIdentifier(DISPATCH), node)
          }
          if (parent === builderParameter) return node
          report(
            node,
            DiagnosticCode.EscapedBuilder,
            `${builder} may only be called or passed to a helper view; other uses have no React equivalent.`,
          )
          return node
        }
        return ts.visitEachChild(node, visit, context)
      }

      const messageType = site.messageType ?? f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      const typed = (parameter: ts.ParameterDeclaration, index: number) => {
        const type = site.parameterTypes[index]
        return parameter.type !== undefined || type === undefined
          ? parameter
          : f.updateParameterDeclaration(
              parameter,
              parameter.modifiers,
              parameter.dotDotDotToken,
              parameter.name,
              parameter.questionToken,
              type,
              parameter.initializer,
            )
      }
      const parameters = view.parameters.map((parameter, index) =>
        parameter === builderParameter
          ? f.createParameterDeclaration(
              undefined,
              undefined,
              DISPATCH,
              undefined,
              f.createFunctionTypeNode(
                undefined,
                [
                  f.createParameterDeclaration(
                    undefined,
                    undefined,
                    'message',
                    undefined,
                    messageType,
                  ),
                ],
                f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
              ),
            )
          : typed(ts.visitEachChild(parameter, visit, context) as ts.ParameterDeclaration, index),
      )
      const body = view.body && (visit(view.body) as ts.ConciseBody)
      const type = view.type && (visit(view.type) as ts.TypeNode)

      if (ts.isArrowFunction(view)) {
        return f.updateArrowFunction(
          view,
          view.modifiers,
          view.typeParameters,
          parameters,
          type,
          view.equalsGreaterThanToken,
          body!,
        )
      }
      if (ts.isFunctionExpression(view)) {
        return f.updateFunctionExpression(
          view,
          view.modifiers,
          view.asteriskToken,
          view.name,
          view.typeParameters,
          parameters,
          type,
          body as ts.Block,
        )
      }
      return f.updateFunctionDeclaration(
        view,
        view.modifiers,
        view.asteriskToken,
        view.name,
        view.typeParameters,
        parameters,
        type,
        body as ts.Block | undefined,
      )
    }

    const visitTop = (node: ts.Node): ts.Node => {
      if (isHtmlType(node)) return reactNodeType()
      const site = viewSite(node)
      if (site !== undefined) return visitView(site)
      const slot = slotCall(node)
      if (slot !== undefined) return lowerSlot(slot, visitTop)
      if (
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.every(
          declaration => ts.isIdentifier(declaration.name) && slots.has(declaration.name.text),
        )
      ) {
        // The slot's calls are lowered to direct calls, so the slot itself goes.
        return undefined as unknown as ts.Node
      }
      if (isEscapedLazy(node)) return node
      return ts.visitEachChild(node, visitTop, context)
    }

    return file => ts.visitEachChild(file, visitTop, context)
  }

  const result = ts.transform(source, [transformer])
  if (diagnostics.length > 0) {
    result.dispose()
    return { ok: false, diagnostics }
  }

  let output = result.transformed[0]!
  if (converted) output = rewriteImports(output)
  const header = `// @generated by foldkit-react-codegen from ${fileName.replace(/\\/g, '/')}. Do not edit.\n`
  // Printed before dispose, which discards the source map ranges set during the transform.
  const printed = options.sourceMap ? printWithSourceMap(output) : { code: printFile(output) }
  result.dispose()
  if (!('map' in printed)) return { ok: true, code: header + printed.code, diagnostics: [] }
  // The header adds one generated line before the printed code.
  const map = JSON.parse(printed.map) as { mappings: string }
  map.mappings = `;${map.mappings}`
  return { ok: true, code: header + printed.code, map: JSON.stringify(map), diagnostics: [] }
}

const FOLDKIT_MODULES = new Set(['foldkit', 'foldkit/html', 'foldkit/submodel'])

/** Identifier names referenced outside import declarations, including in synthesized nodes. */
const referencedNames = (file: ts.SourceFile) => {
  const names = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text)
    ts.forEachChild(node, walk)
  }
  file.statements.filter(statement => !ts.isImportDeclaration(statement)).forEach(walk)
  return names
}

/**
 * Drops Foldkit imports the compiled output no longer references (`Html`,
 * `HtmlBuilder`, lazy factories, the Submodel namespace) and imports `ReactNode`.
 */
const rewriteImports = (file: ts.SourceFile): ts.SourceFile => {
  const used = referencedNames(file)
  const statements: Array<ts.Statement> = []
  for (const statement of file.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined
    if (
      !ts.isImportDeclaration(statement) ||
      clause === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !FOLDKIT_MODULES.has(statement.moduleSpecifier.text)
    ) {
      statements.push(statement)
      continue
    }
    const name = clause.name !== undefined && used.has(clause.name.text) ? clause.name : undefined
    const bindings = clause.namedBindings
    const namedBindings =
      bindings === undefined
        ? undefined
        : ts.isNamespaceImport(bindings)
          ? used.has(bindings.name.text)
            ? bindings
            : undefined
          : bindings.elements.some(element => used.has(element.name.text))
            ? f.updateNamedImports(
                bindings,
                bindings.elements.filter(element => used.has(element.name.text)),
              )
            : undefined
    if (name === undefined && namedBindings === undefined) continue
    statements.push(
      f.updateImportDeclaration(
        statement,
        statement.modifiers,
        f.updateImportClause(clause, clause.isTypeOnly, name, namedBindings),
        statement.moduleSpecifier,
        statement.attributes,
      ),
    )
  }
  const reactImport = f.createImportDeclaration(
    undefined,
    f.createImportClause(
      true,
      undefined,
      f.createNamedImports([
        f.createImportSpecifier(false, undefined, f.createIdentifier('ReactNode')),
      ]),
    ),
    f.createStringLiteral('react'),
  )
  return f.updateSourceFile(file, [reactImport, ...statements])
}
