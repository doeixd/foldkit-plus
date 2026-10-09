/**
 * The `cloudflare:workers` runtime module exists only in workerd: esbuild
 * leaves the import external and miniflare provides it. Its types do not
 * resolve in this example, so the entry declares the sliver it uses.
 * If `@cloudflare/workers-types` ever provides this module here, delete
 * this file and use theirs.
 */
declare module 'cloudflare:workers' {
  const DurableObject: new (ctx: unknown, env: unknown) => object
}
