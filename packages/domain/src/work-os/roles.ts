import { DEFAULT_PERMISSIONS } from './permissions'
import { permissionSlugsMatchingTypes } from './rules'
import type { DefaultRole } from './types'

export const DEFAULT_ROLES = [
	{
		name: 'Reader',
		slug: 'reader',
		description: 'Can read prompts and workflows',
		permissions: permissionSlugsMatchingTypes(DEFAULT_PERMISSIONS, [
			'read',
			'require-approval',
		]),
	},
	{
		name: 'Writer',
		description: 'Can edit prompts and workflows',
		slug: 'writer',
		permissions: permissionSlugsMatchingTypes(DEFAULT_PERMISSIONS, [
			'write',
			'read',
			'require-approval',
		]),
	},
] as const satisfies readonly DefaultRole[]
