/** Runs `start` again, up to five times, while it fails with Vite's "Port N is already in use". */
export declare const onFreePort: <A>(start: () => Promise<A>) => Promise<A>
