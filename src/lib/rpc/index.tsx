'use client'
/** Convex public API — prefer `$cvx.funcs.*` from route context in `_shell`. */
/** @deprecated Use `$cvx.funcs.*` from route context instead of bare `rpc`. */
export { api as cvx, api as rpc } from '@convex/api'
export {
	convexQuery,
	useConvexMutation,
	useConvexQuery,
} from '@convex-dev/react-query'
export { useAction, useMutation } from 'convex/react'
export { usePaginatedQuery, useQuery } from 'convex-helpers/react'
