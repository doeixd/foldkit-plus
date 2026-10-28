/**
 * CSS math, evaluated: numbers, `deg`, `+ - * /`, parentheses, `calc`, `min`,
 * `max`, `clamp`, `pow`, `cos`, `sin`, `var()` with or without a fallback,
 * and bare keywords (a relative color's `l` and `c`) from the scope. It works
 * out the hues a theme's knob variables place, and lets a test read the
 * palette's text as the browser does rather than a copy of its formula.
 * Anything else throws.
 */
type Scope = { readonly [name: string]: number | string }

/** `source`'s value in `scope`, each variable worked out once, as a browser does. */
export const evaluate = (source: string, scope: Scope): number =>
  evaluateIn(source, scope, new Map())

const evaluateIn = (source: string, scope: Scope, known: Map<string, number>): number => {
  const tokens = source.match(/-?\d*\.?\d+(?:e-?\d+)?(?:deg)?|--[\w-]+|[a-z]+|[()+\-*/,]/gi) ?? []
  let at = 0
  const peek = () => tokens[at]
  const next = () => tokens[at++]!
  const expect = (token: string) => {
    if (next() !== token) throw new Error(`expected ${token} at ${at} in ${source}`)
  }
  const args = (): Array<number> => {
    expect('(')
    const values = [sum()]
    while (peek() === ',') {
      next()
      values.push(sum())
    }
    expect(')')
    return values
  }
  const functions: { readonly [name: string]: (values: Array<number>) => number } = {
    calc: ([x]) => x!,
    min: values => Math.min(...values),
    max: values => Math.max(...values),
    clamp: ([low, x, high]) => Math.max(low!, Math.min(x!, high!)),
    pow: ([x, y]) => x! ** y!,
    cos: ([x]) => Math.cos(x!),
    sin: ([x]) => Math.sin(x!),
  }
  const primary = (): number => {
    const token = next()
    if (token === '(') {
      const value = sum()
      expect(')')
      return value
    }
    if (token === '-') return -primary()
    if (token === 'var') {
      expect('(')
      const name = next()
      if (peek() === ',') {
        next()
        const fallback = sum()
        expect(')')
        return Object.hasOwn(scope, name) ? lookup(name) : fallback
      }
      expect(')')
      return lookup(name)
    }
    if (Object.hasOwn(functions, token)) return functions[token]!(args())
    if (/^-?\d*\.?\d/.test(token))
      return token.endsWith('deg') ? (Number.parseFloat(token) * Math.PI) / 180 : Number(token)
    return lookup(token)
  }
  const product = (): number => {
    let value = primary()
    while (peek() === '*' || peek() === '/')
      value = next() === '*' ? value * primary() : value / primary()
    return value
  }
  const sum = (): number => {
    let value = product()
    while (peek() === '+' || peek() === '-')
      value = next() === '+' ? value + product() : value - product()
    return value
  }
  const lookup = (name: string): number => {
    if (!Object.hasOwn(scope, name)) throw new Error(`${name} is not in scope`)
    const value = scope[name]!
    if (typeof value === 'number') return value
    const cached = known.get(name)
    if (cached !== undefined) return cached
    const worked = evaluateIn(value, scope, known)
    known.set(name, worked)
    return worked
  }
  const value = sum()
  if (at !== tokens.length) throw new Error(`unread input at ${at} in ${source}`)
  return value
}
