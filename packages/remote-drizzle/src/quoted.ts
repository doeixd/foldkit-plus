/** A name as SQL quotes it, its own quotes doubled. Not exported from the package. */
export const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`
