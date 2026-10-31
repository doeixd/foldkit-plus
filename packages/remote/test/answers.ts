/**
 * A mutation a test domain registers so it installs the write code (#378):
 * these tests reduce answers and pending layers made by hand, which a domain
 * that registers no mutation refuses.
 */
import { Mutation } from '../src/index.js'

export const Answers = Mutation.make('Answers', { Input: {}, Output: {} })
