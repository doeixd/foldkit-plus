/**
 * The host's parts, broken one at a time:
 * `pnpm mutate packages/host/test/host.mutations.ts`
 */
const isolate = ['packages/host/test/isolate.test.ts']
const template = ['packages/host/test/template.test.ts']
const routes = ['packages/host/test/routes.test.ts']
const node = ['packages/host/test/node.test.ts']

export default [
  {
    name: 'an isolate builds on every call',
    edits: [
      { file: '../src/isolate.ts', find: 'if (held !== undefined) return held', replace: '' },
    ],
    tests: isolate,
  },
  {
    name: 'a failed isolate build is kept, and every later call fails with it',
    edits: [
      {
        file: '../src/isolate.ts',
        find: 'value.catch(() => built.delete(binding))',
        replace: 'value.catch(() => {})',
      },
    ],
    tests: isolate,
  },
  {
    name: 'a build that throws before its promise escapes the isolate',
    edits: [
      {
        file: '../src/isolate.ts',
        find: 'new Promise<A>(resolve => resolve(build(env)))',
        replace: 'Promise.resolve(build(env))',
      },
    ],
    tests: isolate,
  },
  {
    name: 'every isolate shares one table, so two over one binding read each other',
    edits: [
      {
        file: '../src/isolate.ts',
        find: '  const built = new WeakMap<object, Promise<A>>()\n',
        replace: '',
      },
      {
        file: '../src/isolate.ts',
        find: 'export const isolate = <Env, A>(',
        replace:
          'const built = new WeakMap<object, Promise<any>>()\nexport const isolate = <Env, A>(',
      },
    ],
    tests: isolate,
  },
  {
    name: 'an isolate is keyed by the env object, not the binding',
    edits: [
      {
        file: '../src/isolate.ts',
        find: 'const binding = key(env)',
        replace: 'const binding = env as object',
      },
    ],
    tests: isolate,
  },
  {
    name: 'the template is read on every call',
    edits: [
      {
        file: '../src/template.ts',
        find: 'return isolate(binding, async env => {',
        replace: 'return (async (env: Env) => {',
      },
    ],
    tests: template,
  },
  {
    name: 'the template path is ignored',
    edits: [
      {
        file: '../src/template.ts',
        find: "const path = options.path ?? '/index.html'",
        replace: "const path = '/index.html'",
      },
    ],
    tests: template,
  },
  {
    name: 'a missing template is read as one',
    edits: [{ file: '../src/template.ts', find: 'if (!response.ok)', replace: 'if (false)' }],
    tests: template,
  },
  {
    name: 'a template no build stamped renders under no id',
    edits: [
      {
        file: '../src/template.ts',
        find: 'const buildId = buildIdPattern.exec(html)?.[1]',
        replace: "const buildId = buildIdPattern.exec(html)?.[1] ?? ''",
      },
    ],
    tests: template,
  },
  {
    name: 'buildTag writes under another name',
    edits: [
      {
        file: '../src/template.ts',
        find: 'attrs: { name: BUILD_META,',
        replace: "attrs: { name: 'build',",
      },
    ],
    tests: template,
  },
  {
    name: 'an unset origin is answered as if set',
    edits: [
      {
        file: '../src/routes.ts',
        find: 'if (!isSet(env[config.origin])) return unset(config.origin)',
        replace: '',
      },
    ],
    tests: routes,
  },
  {
    name: 'an empty origin passes the check',
    edits: [
      {
        file: '../src/routes.ts',
        find: "typeof value === 'string' && value !== ''",
        replace: "typeof value === 'string'",
      },
    ],
    tests: routes,
  },
  {
    name: 'the 500 names no variable',
    edits: [
      {
        file: '../src/routes.ts',
        find: 'new Response(`Set ${name} to where this application is served.`',
        replace: "new Response('Set the origin.'",
      },
    ],
    tests: [...routes, ...node],
  },
  {
    name: 'assets wait for the origin check',
    edits: [
      {
        file: '../src/routes.ts',
        find: '    if (assets !== undefined && assets.matches(pathname)) return assets.binding(env).fetch(request)\n',
        replace: '',
      },
      {
        file: '../src/routes.ts',
        find: '    const configured = env as Configured<Env, K>\n',
        replace:
          '    const configured = env as Configured<Env, K>\n    if (assets !== undefined && assets.matches(pathname)) return assets.binding(env).fetch(request)\n',
      },
    ],
    tests: routes,
  },
  {
    name: 'a path ending in / takes itself alone',
    edits: [
      {
        file: '../src/routes.ts',
        find: "path.endsWith('/') ? pathname => pathname.startsWith(path) :",
        replace: "path.endsWith('/') ? pathname => pathname === path :",
      },
    ],
    tests: routes,
  },
  {
    name: 'any path is a prefix',
    edits: [
      {
        file: '../src/routes.ts',
        find: ': pathname => pathname === path',
        replace: ': pathname => pathname.startsWith(path)',
      },
    ],
    tests: routes,
  },
  {
    name: 'the last route written wins',
    edits: [
      {
        file: '../src/routes.ts',
        find: 'for (const route of table) if',
        replace: 'for (const route of table.toReversed()) if',
      },
    ],
    tests: routes,
  },
  {
    name: 'a route not starting with / is taken',
    edits: [
      {
        file: '../src/routes.ts',
        find: "if (!path.startsWith('/')) throw",
        replace: 'if (false) throw',
      },
    ],
    tests: routes,
  },
  {
    name: 'Node takes the request target as it came',
    edits: [
      {
        file: '../src/node.ts',
        find: "const url = resolveRequestUrl(request.url ?? '/', origin)",
        replace:
          "const url = new URL(request.url ?? '/', 'http://' + request.headers['host']).href",
      },
    ],
    tests: node,
  },
  {
    name: 'Node answers with an unset origin',
    edits: [
      {
        file: '../src/node.ts',
        find: '      if (!isSet(origin)) return unset(config.origin)\n',
        replace: '',
      },
    ],
    tests: node,
  },
  {
    name: 'Node drops the request body',
    edits: [
      {
        file: '../src/node.ts',
        find: '...(body === undefined ? {} : { body }),',
        replace: '',
      },
    ],
    tests: node,
  },
  {
    name: 'Node writes one cookie of several',
    edits: [
      {
        file: '../src/node.ts',
        find: "headers['set-cookie'] = cookies",
        replace: "headers['set-cookie'] = cookies.slice(0, 1)",
      },
    ],
    tests: node,
  },
  {
    name: 'Node keeps a stream running after its client left',
    edits: [
      {
        file: '../src/node.ts',
        find: "else closed.addEventListener('abort', cancel)",
        replace: '',
      },
    ],
    tests: node,
  },
  {
    name: 'Node ignores a client that left before the handler answered',
    edits: [
      {
        file: '../src/node.ts',
        find: 'if (closed.aborted) cancel()',
        replace: 'if (false) cancel()',
      },
    ],
    tests: node,
  },
  {
    name: 'Node reads a body of any size',
    edits: [{ file: '../src/node.ts', find: 'if (read > limit)', replace: 'if (false)' }],
    tests: node,
  },
  {
    name: "Node answers a handler's failure with its message",
    edits: [
      {
        file: '../src/node.ts',
        find: "return new Response('The request could not be answered.', { status: 500 })",
        replace: 'return new Response(String(error), { status: 500 })',
      },
    ],
    tests: node,
  },
]
