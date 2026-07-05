import { WorkOS } from '@workos-inc/node'

export {
	DEFAULT_PERMISSIONS,
	DEFAULT_ROLES,
	type DefaultRole,
	type DomainModule,
	type Permission,
	type PermissionSlug,
	type PermissionType,
} from '@agent.io/domain/work-os'

import { env } from './env'

export const workOs = new WorkOS({
	apiKey: env.WORKOS_API_KEY,
	clientId: env.WORKOS_CLIENT_ID,
})
