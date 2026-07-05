import type { Permission, PermissionSlug, PermissionType } from './types'

export function permissionSlugsMatchingTypes(
	permissions: readonly Permission[],
	types: readonly PermissionType[],
): PermissionSlug[] {
	return permissions
		.filter((permission) =>
			types.some((type) => permission.slug.endsWith(type)),
		)
		.map((permission) => permission.slug)
}
