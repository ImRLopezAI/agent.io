import { getAuth } from '@workos/authkit-tanstack-react-start'
import { headers } from 'next/headers'

import { createRpcContext, type RpcContextType } from './init'

const serverProcedureOptions = {
	context: async (): Promise<RpcContextType> =>
		createRpcContext({ headers: await headers(), session: await getAuth() }),
}

type CallableActionable = {
	actionable: (options: typeof serverProcedureOptions) => unknown
	callable: (options: typeof serverProcedureOptions) => unknown
}

/** After `.handler()`, attach server-action + server-side client support. */
export function withServerClients<R extends CallableActionable>(
	procedure: R,
): R {
	let current: CallableActionable = procedure
	current = current.actionable(serverProcedureOptions) as CallableActionable
	current.callable(serverProcedureOptions)
	return current as unknown as R
}

/** Define a handler and attach shared `.actionable()` / `.callable()` options. */
export function defineHandler<H, R extends CallableActionable>(
	implementer: { handler: (fn: H) => R },
	handler: H,
): R {
	return withServerClients(implementer.handler(handler))
}
