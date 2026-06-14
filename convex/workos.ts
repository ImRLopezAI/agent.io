import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { authKit } from './auth'
import { DEFAULT_ROLES, DEFAULT_PERMISSIONS } from '@/lib/work-os'

export const ensureCustomerRoleOnOrg = internalAction({
	args: { organizationId: v.string() },
	handler: async (_ctx, { organizationId }) => {
		try {
			// await authKit.workos.authorization.createOrganizationRole(
			// 	organizationId,

			// )
			for (const permission of DEFAULT_PERMISSIONS) {
				try {
					await authKit.workos.authorization.createPermission({
						slug: permission.slug,
						name: permission.name,
						description: permission.description ?? undefined,
					})
				} catch (err) {
					console.error(`createPermission(${permission.slug}) failed`, err)
				}
			}

			for (const role of DEFAULT_ROLES) {
				try {
					await authKit.workos.authorization.createOrganizationRole(
						organizationId,
						{
							slug: role.slug,
							name: role.name,
							description: role.description ?? undefined,
						},
					)
				} catch (err) {
					console.error(`createOrganizationRole(${role.slug}) failed`, err)
				}
			}
			for (const role of DEFAULT_ROLES) {
				try {
					await authKit.workos.authorization.setOrganizationRolePermissions(
						organizationId,
						role.slug,
						{ permissions: role.permissions },
					)
				} catch (err) {
					console.error(
						`setOrganizationRolePermissions(${role.slug}) failed`,
						err,
					)
				}
			}
		} catch (err) {
			if (!isAlreadyExistsError(err)) {
				console.error(
					`ensureCustomerRoleOnOrg(${organizationId}): role create failed`,
					err,
				)
				throw err
			}
		}

		// Permissions are env-scoped — only create them if missing.
	},
})
function isAlreadyExistsError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false
	const candidate = err as { status?: number; name?: string; message?: string }
	if (candidate.status === 409) return true
	if (candidate.name === 'ConflictException') return true
	const message = candidate.message?.toLowerCase() ?? ''
	return message.includes('already exists') || message.includes('duplicate')
}
