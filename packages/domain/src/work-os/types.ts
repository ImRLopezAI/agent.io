export type PermissionType = 'read' | 'write' | 'require-approval' | 'admin'

export type DomainModule =
	| 'prompts'
	| 'workflows'
	| 'organizations'
	| 'users'
	| 'logs'
	| 'conversations'

export type PermissionSlug = `${DomainModule}:${PermissionType}`

export interface Permission {
	name: string
	description: string
	slug: PermissionSlug
}

export interface DefaultRole {
	name: string
	description: string
	slug: string
	permissions: PermissionSlug[]
}
