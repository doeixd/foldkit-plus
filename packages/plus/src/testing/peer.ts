/**
 * Loads an optional peer of a `foldkit-plus/testing` subpath on first use, so
 * importing the subpath loads nothing an application has not installed, and a
 * missing peer says what to install instead of Node's bare "Cannot find
 * package". Internal: not an export of `foldkit-plus`.
 */
export const peer = async <Module>(
  subpath: string,
  name: string,
  load: () => Promise<Module>,
): Promise<Module> => {
  try {
    return await load()
  } catch (error) {
    if (!isMissing(error, name)) throw error
    throw new Error(
      `foldkit-plus/${subpath} needs \`${name}\`, which is not installed. ` +
        `Add it as a dev dependency: pnpm add -D ${name}`,
      { cause: error },
    )
  }
}

// Node and Vitest both say `Cannot find package 'name'`. A package that is
// installed but fails to load names something else, and is rethrown as it is.
const isMissing = (error: unknown, name: string): boolean =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'ERR_MODULE_NOT_FOUND' &&
  error.message.includes(`'${name}'`)
