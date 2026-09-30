/**
 * Builds the fixture site in a plain Node process: `vite` cannot be
 * imported where a DOM realm owns the globals (a jsdom test fails to
 * collect), so DOM tests run this script for their build instead of
 * importing the fixture helper. Prints the absolute output directory.
 * Run under tsx from packages/ssr (its tsconfig paths resolve workspace
 * packages to source).
 */
import { buildFixtureSite } from './staticSiteFixture.js'

process.stdout.write(await buildFixtureSite(process.argv[2] ?? 'dist-fixture-resume'))
