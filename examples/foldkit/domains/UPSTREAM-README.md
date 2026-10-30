# Foldkit Domains

An unofficial recreation of the [Vercel Domains](https://vercel.com/domains) search interaction, built with Cloudflare, Alchemy, [Foldkit](https://foldkit.dev), and Effect: the CAFE stack.

[Try the demo](https://domains.foldkit.dev) · Sample prices and availability · No purchases or reservations

The app explores URL synchronization, debounced and cached requests, progressive loading, virtualization, filters, sorting, SSR, hydration, and accessible interactions. Story + Scene tests protect the behavior, and the deployed DevTools let you inspect it.

## Run locally

Requires Node.js 24.11.1 or newer and pnpm 12.4.2.

```sh
pnpm install
pnpm dev
```

## Explore the project

- [Architecture](docs/architecture.md): code map, search flow, caching, hydration, and DevTools.
- [Testing](docs/testing.md): commands, regression invariants, and browser coverage.
- [Deployment](docs/deployment.md): local production builds, Cloudflare through Alchemy, and social assets.
- [Framework preview notes](docs/framework-preview.md): pinned versions, integration workarounds, and reference source.

This is an independent Foldkit demo, not affiliated with Vercel. Domain searches use deterministic sample data served by a same-origin Effect RPC backend; they make no registrar API calls.

## License

[MIT](LICENSE)
