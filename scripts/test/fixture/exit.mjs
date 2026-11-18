/** The command `scripts/test/cached.test.ts` caches: exits with $FIXTURE_EXIT. */
process.exit(Number(process.env['FIXTURE_EXIT'] ?? 0))
