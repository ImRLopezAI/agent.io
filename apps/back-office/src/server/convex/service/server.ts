import { api } from '@convex/api'
import { ConvexHttpClient } from 'convex/browser'

/*
  Convex client instance for server-side usage

  @example
  const query = await convex.query(api.defenses.listDefenses, {})
  const mutation = convex.mutation(api.seed.seedDatabase , {
    replace: true,
  })
*/
const convexUrl = import.meta.env.VITE_CONVEX_URL ?? process.env.VITE_CONVEX_URL
if (!convexUrl) {
	throw new Error('VITE_CONVEX_URL environment variable is not set')
}
const convex = new ConvexHttpClient(convexUrl)

export { api, convex }
