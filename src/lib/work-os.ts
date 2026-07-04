import { type OrganizationRole, WorkOS } from '@workos-inc/node'

import { env } from './env'
export const workOs = new WorkOS({
	apiKey: env.WORKOS_API_KEY,
	clientId: env.WORKOS_CLIENT_ID,
})

type PermissionType = 'read' | 'write' | 'require-approval' | 'admin'
type Modules =
	| 'prompts'
	| 'workflows'
	| 'organizations'
	| 'users'
	| 'logs'
	| 'conversations'
type PermissionSlug = `${Modules}:${PermissionType}`

interface Permission {
	name: string
	description: string
	slug: PermissionSlug
}

export const DEFAULT_PERMISSIONS: Permission[] = [
	{
		name: 'Prompt Editor',
		description: 'Can edit prompts',
		slug: 'prompts:write',
	},
	{
		name: 'Prompt Viewer',
		description: 'Can view prompts',
		slug: 'prompts:read',
	},
	{
		name: 'Prompt Approver',
		description: 'Can approve prompts',
		slug: 'prompts:require-approval',
	},
	{
		name: 'Prompt Admin',
		description: 'Can admin prompts',
		slug: 'prompts:admin',
	},
	{
		name: 'Workflow Editor',
		description: 'Can edit workflows',
		slug: 'workflows:write',
	},
	{
		name: 'Workflow Viewer',
		description: 'Can view workflows',
		slug: 'workflows:read',
	},
	{
		name: 'Workflow Approver',
		description: 'Can approve workflows',
		slug: 'workflows:require-approval',
	},
	{
		name: 'Workflow Admin',
		description: 'Can admin workflows',
		slug: 'workflows:admin',
	},
	{
		name: 'Conversation Reader',
		description: 'Can read conversations',
		slug: 'conversations:read',
	},

	{
		name: 'Conversation Admin',
		description: 'Can admin conversations',
		slug: 'conversations:admin',
	},
] as const

export const DEFAULT_ROLES: Pick<
	OrganizationRole,
	'name' | 'description' | 'permissions' | 'slug'
>[] = [
	{
		name: 'Reader',
		slug: 'reader',
		description: 'Can read prompts and workflows',
		permissions: DEFAULT_PERMISSIONS.filter((permission) =>
			['read', 'require-approval'].some((type) =>
				permission.slug.endsWith(type),
			),
		).map((permission) => permission.slug),
	},
	{
		name: 'Writer',
		description: 'Can edit prompts and workflows',
		slug: 'writer',
		permissions: DEFAULT_PERMISSIONS.filter((permission) =>
			['write', 'read', 'require-approval'].some((type) =>
				permission.slug.endsWith(type),
			),
		).map((permission) => permission.slug),
	},
] as const
