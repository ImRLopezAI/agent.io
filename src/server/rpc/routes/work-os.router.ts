import type { MemberRow, OrgRole } from '@server/rpc/contracts/work-os.contract'
import { admin, adminOrg, auth, org, os } from '@server/rpc/init'
import type { Invitation, OrganizationMembership, User } from '@workos-inc/node'

/**
 * WorkOS organization router. The active organization is always
 * `context.organizationId` (added by the `org`/`adminOrg` middleware) — never
 * read from input. Reads are built from `org` (any active member); org-scoped
 * mutations from `adminOrg` (admin role + active org, so `organizationId` is
 * guaranteed). `organization.create` uses `admin` (no active org needed).
 * `listMyMemberships` is user-scoped (it spans every org) so it is built from
 * `auth`, not `org`, and must not require an active organization.
 *
 * The Management API does not authorize by the caller's role, so this
 * middleware layer is the only authorization boundary.
 */

const fullName = (user: Pick<User, 'firstName' | 'lastName'>) =>
	[user.firstName, user.lastName].filter(Boolean).join(' ') || null

const toInvitationRow = (invitation: Invitation) => ({
	id: invitation.id,
	email: invitation.email,
	state: invitation.state,
	expiresAt: invitation.expiresAt,
	roleSlug: null,
})

export const workOsRouter = os.workOs.router({
	organization: {
		getActive: org.workOs.organization.getActive.handler(
			async ({ context }) => {
				return context.workOs.organizations.getOrganization(
					context.organizationId,
				)
			},
		),
		listMyMemberships: auth.workOs.organization.listMyMemberships.handler(
			async ({ context }) => {
				const data = await context.workOs.userManagement
					.listOrganizationMemberships({ userId: context.user.id })
					.then((page) => page.autoPagination())
				return data.map((m) => ({
					organizationId: m.organizationId,
					organizationName: m.organizationName,
					roleSlug: m.role.slug,
				}))
			},
		),
		update: adminOrg.workOs.organization.update.handler(
			async ({ context, input }) => {
				return context.workOs.organizations.updateOrganization({
					organization: context.organizationId,
					name: input.name,
				})
			},
		),
		create: admin.workOs.organization.create.handler(
			async ({ context, input }) => {
				return context.workOs.organizations.createOrganization({
					name: input.name,
				})
			},
		),
		remove: adminOrg.workOs.organization.remove.handler(async ({ context }) => {
			await context.workOs.organizations.deleteOrganization(
				context.organizationId,
			)
			return { ok: true }
		}),
		leave: org.workOs.organization.leave.handler(
			async ({ context, errors }) => {
				const { data } =
					await context.workOs.userManagement.listOrganizationMemberships({
						organizationId: context.organizationId,
						userId: context.user.id,
					})
				const membership = data[0]
				if (!membership) throw errors.NOT_FOUND()
				await context.workOs.userManagement.deleteOrganizationMembership(
					membership.id,
				)
				return { ok: true }
			},
		),
	},
	members: {
		list: org.workOs.members.list.handler(async ({ context }) => {
			const organizationId = context.organizationId
			const [memberships, roles] = await Promise.all([
				context.workOs.userManagement
					.listOrganizationMemberships({ organizationId })
					.then((page) => page.autoPagination()),
				context.workOs.organizations
					.listOrganizationRoles({ organizationId })
					.then((list) => list.data),
			])
			return Promise.all(
				memberships.map((m) => enrichMember(context.workOs, m, roles)),
			)
		}),
		updateRole: adminOrg.workOs.members.updateRole.handler(
			async ({ context, input, errors }) => {
				const organizationId = context.organizationId
				// Re-check the target belongs to the active org BEFORE mutating —
				// the SDK acts on a global membership id (cross-tenant IDOR otherwise).
				const owned = await membershipInActiveOrg(
					context.workOs,
					input.membershipId,
					organizationId,
				)
				if (!owned) throw errors.NOT_FOUND()
				await context.workOs.userManagement.updateOrganizationMembership(
					input.membershipId,
					{ roleSlug: input.roleSlug },
				)
				const [membership, roles] = await Promise.all([
					context.workOs.userManagement.getOrganizationMembership(
						input.membershipId,
					),
					context.workOs.organizations
						.listOrganizationRoles({ organizationId })
						.then((list) => list.data),
				])
				return enrichMember(context.workOs, membership, roles)
			},
		),
		remove: adminOrg.workOs.members.remove.handler(
			async ({ context, input, errors }) => {
				const owned = await membershipInActiveOrg(
					context.workOs,
					input.membershipId,
					context.organizationId,
				)
				if (!owned) throw errors.NOT_FOUND()
				await context.workOs.userManagement.deleteOrganizationMembership(
					input.membershipId,
				)
				return { membershipId: input.membershipId }
			},
		),
	},
	invitations: {
		list: org.workOs.invitations.list.handler(async ({ context }) => {
			const data = await context.workOs.userManagement
				.listInvitations({ organizationId: context.organizationId })
				.then((page) => page.autoPagination())
			return data.map(toInvitationRow)
		}),
		send: adminOrg.workOs.invitations.send.handler(
			async ({ context, input }) => {
				const invitation = await context.workOs.userManagement.sendInvitation({
					email: input.email,
					organizationId: context.organizationId,
					roleSlug: input.roleSlug,
				})
				return toInvitationRow(invitation)
			},
		),
		revoke: adminOrg.workOs.invitations.revoke.handler(
			async ({ context, input, errors }) => {
				const owned = await invitationInActiveOrg(
					context.workOs,
					input.invitationId,
					context.organizationId,
				)
				if (!owned) throw errors.NOT_FOUND()
				const invitation = await context.workOs.userManagement.revokeInvitation(
					input.invitationId,
				)
				return toInvitationRow(invitation)
			},
		),
		resend: adminOrg.workOs.invitations.resend.handler(
			async ({ context, input, errors }) => {
				const owned = await invitationInActiveOrg(
					context.workOs,
					input.invitationId,
					context.organizationId,
				)
				if (!owned) throw errors.NOT_FOUND()
				const invitation = await context.workOs.userManagement.resendInvitation(
					input.invitationId,
				)
				return toInvitationRow(invitation)
			},
		),
		listMine: auth.workOs.invitations.listMine.handler(async ({ context }) => {
			const data = await context.workOs.userManagement
				.listInvitations({ email: context.user.email })
				.then((page) => page.autoPagination())
			return data.map((i) => ({
				id: i.id,
				organizationId: i.organizationId,
				state: i.state,
				expiresAt: i.expiresAt,
				acceptUrl: i.acceptInvitationUrl,
			}))
		}),
	},
	roles: {
		list: org.workOs.roles.list.handler(async ({ context }) => {
			const { data } = await context.workOs.organizations.listOrganizationRoles(
				{
					organizationId: context.organizationId,
				},
			)
			return data.map(
				(r): OrgRole => ({
					id: r.id,
					slug: r.slug,
					name: r.name,
					description: r.description ?? null,
				}),
			)
		}),
	},
	user: {
		updateProfile: auth.workOs.user.updateProfile.handler(
			async ({ context, input }) => {
				return context.workOs.userManagement.updateUser({
					userId: context.user.id,
					firstName: input.firstName,
					lastName: input.lastName,
				})
			},
		),
	},
})

/**
 * Returns the membership only if it belongs to the active org, else null.
 * The WorkOS membership/invitation ids are GLOBAL — the SDK mutators act on
 * whatever org owns the id — so org-scoped mutations MUST re-check ownership
 * against `context.organizationId` before acting, or an admin of one org could
 * tamper with another org's records (cross-tenant IDOR).
 */
async function membershipInActiveOrg(
	workOs: {
		userManagement: {
			getOrganizationMembership: (id: string) => Promise<OrganizationMembership>
		}
	},
	membershipId: string,
	organizationId: string,
): Promise<OrganizationMembership | null> {
	const membership = await workOs.userManagement
		.getOrganizationMembership(membershipId)
		.catch(() => null)
	return membership && membership.organizationId === organizationId
		? membership
		: null
}

/** Returns the invitation only if it belongs to the active org, else null. */
async function invitationInActiveOrg(
	workOs: {
		userManagement: { getInvitation: (id: string) => Promise<Invitation> }
	},
	invitationId: string,
	organizationId: string,
): Promise<Invitation | null> {
	const invitation = await workOs.userManagement
		.getInvitation(invitationId)
		.catch(() => null)
	return invitation && invitation.organizationId === organizationId
		? invitation
		: null
}

/** Enriches a membership with the user profile + role display name. */
async function enrichMember(
	workOs: { userManagement: { getUser: (id: string) => Promise<User> } },
	membership: OrganizationMembership,
	roles: { slug: string; name: string }[],
): Promise<MemberRow> {
	const user = await workOs.userManagement.getUser(membership.userId)
	return {
		membershipId: membership.id,
		userId: membership.userId,
		email: user.email,
		name: fullName(user),
		avatarUrl: user.profilePictureUrl ?? null,
		status: membership.status,
		roleSlug: membership.role.slug,
		roleName: roles.find((r) => r.slug === membership.role.slug)?.name ?? null,
	}
}
