import { z } from 'zod'
import { base } from './base'

/**
 * WorkOS organization contract. The active organization is NEVER an input —
 * it is derived server-side from the session (`org` middleware adds
 * `context.organizationId`). Reads are gated by the `org` middleware, mutations
 * by the `admin` middleware in the router.
 *
 * Output types that mirror a WorkOS SDK shape author a REAL zod schema for the
 * subset of fields the app uses. A schema (not `z.custom`) is required because
 * `JsonifiedClient` collapses `z.custom` to `unknown` on the client — the type
 * never reaches consumers. The WorkOS object is a superset of the schema, so it
 * output-parses cleanly (extra fields are stripped). Schemas also give OpenAPI a
 * populated body.
 *
 * Every mutation exports its named input schema for reuse as a `useCreateForm`
 * resolver on the client.
 */

/** The active WorkOS organization (subset of fields the app uses). */
export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	externalId: z.string().nullable(),
	metadata: z.record(z.string(), z.string()),
})
export type OrganizationDto = z.infer<typeof organizationSchema>

/** The current WorkOS user profile (subset of fields the app uses). */
export const userSchema = z.object({
	id: z.string(),
	email: z.string(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	emailVerified: z.boolean(),
	profilePictureUrl: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
})
export type UserDto = z.infer<typeof userSchema>

/** A membership of the current user, across every org they belong to. */
export const myMembershipSchema = z.object({
	organizationId: z.string(),
	organizationName: z.string(),
	roleSlug: z.string(),
})
export type MyMembership = z.infer<typeof myMembershipSchema>

/** An enriched member row: membership + user profile + role display name. */
export const memberRowSchema = z.object({
	membershipId: z.string(),
	userId: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	status: z.enum(['active', 'inactive', 'pending']),
	roleSlug: z.string(),
	roleName: z.string().nullable(),
})
export type MemberRow = z.infer<typeof memberRowSchema>

/** A pending/accepted/expired/revoked invitation to the active org. */
export const invitationRowSchema = z.object({
	id: z.string(),
	email: z.string(),
	state: z.enum(['pending', 'accepted', 'expired', 'revoked']),
	expiresAt: z.string(),
	roleSlug: z.string().nullable(),
})
export type InvitationRow = z.infer<typeof invitationRowSchema>

/** An invitation addressed to the current user (to join some org). */
export const myInvitationRowSchema = z.object({
	id: z.string(),
	organizationId: z.string().nullable(),
	state: z.enum(['pending', 'accepted', 'expired', 'revoked']),
	expiresAt: z.string(),
	acceptUrl: z.string(),
})
export type MyInvitationRow = z.infer<typeof myInvitationRowSchema>

/** An org role available for assignment. */
export const orgRoleSchema = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	description: z.string().nullable(),
})
export type OrgRole = z.infer<typeof orgRoleSchema>

// --- Mutation input schemas (exported for form reuse) ---

export const updateOrgInput = z.object({ name: z.string().min(1) })
export const createOrgInput = z.object({ name: z.string().min(1) })
export const updateMemberRoleInput = z.object({
	membershipId: z.string(),
	roleSlug: z.string().min(1),
})
export const removeMemberInput = z.object({ membershipId: z.string() })
export const inviteMemberInput = z.object({
	email: z.string().email(),
	roleSlug: z.string().min(1),
})
export const revokeInvitationInput = z.object({ invitationId: z.string() })
export const resendInvitationInput = z.object({ invitationId: z.string() })
export const updateProfileInput = z.object({
	firstName: z.string().min(1),
	lastName: z.string().min(1),
})

export const workOsContract = {
	organization: {
		getActive: base
			.route({
				method: 'GET',
				path: '/workos/org',
				tags: ['WorkOS', 'Organization'],
				summary: 'Fetch the active organization',
			})
			.output(organizationSchema),
		listMyMemberships: base
			.route({
				method: 'GET',
				path: '/workos/org/memberships',
				tags: ['WorkOS', 'Organization'],
				summary: "List the current user's organization memberships",
			})
			.output(z.array(myMembershipSchema)),
		update: base
			.route({
				method: 'PATCH',
				path: '/workos/org',
				tags: ['WorkOS', 'Organization'],
				summary: 'Update the active organization',
			})
			.input(updateOrgInput)
			.output(organizationSchema),
		create: base
			.route({
				method: 'POST',
				path: '/workos/org',
				tags: ['WorkOS', 'Organization'],
				summary: 'Create an organization',
			})
			.input(createOrgInput)
			.output(organizationSchema),
		remove: base
			.route({
				method: 'DELETE',
				path: '/workos/org',
				tags: ['WorkOS', 'Organization'],
				summary: 'Delete the active organization',
			})
			.output(z.object({ ok: z.boolean() })),
		leave: base
			.route({
				method: 'POST',
				path: '/workos/org/leave',
				tags: ['WorkOS', 'Organization'],
				summary: 'Leave the active organization (delete own membership)',
			})
			.output(z.object({ ok: z.boolean() })),
	},
	members: {
		list: base
			.route({
				method: 'GET',
				path: '/workos/org/members',
				tags: ['WorkOS', 'Members'],
				summary: 'List members of the active organization',
			})
			.output(z.array(memberRowSchema)),
		updateRole: base
			.route({
				method: 'PATCH',
				path: '/workos/org/members/{membershipId}',
				tags: ['WorkOS', 'Members'],
				summary: "Update a member's role",
			})
			.input(updateMemberRoleInput)
			.output(memberRowSchema),
		remove: base
			.route({
				method: 'DELETE',
				path: '/workos/org/members/{membershipId}',
				tags: ['WorkOS', 'Members'],
				summary: 'Remove a member from the active organization',
			})
			.input(removeMemberInput)
			.output(z.object({ membershipId: z.string() })),
	},
	invitations: {
		list: base
			.route({
				method: 'GET',
				path: '/workos/org/invitations',
				tags: ['WorkOS', 'Invitations'],
				summary: 'List invitations for the active organization',
			})
			.output(z.array(invitationRowSchema)),
		send: base
			.route({
				method: 'POST',
				path: '/workos/org/invitations',
				tags: ['WorkOS', 'Invitations'],
				summary: 'Invite a member to the active organization',
			})
			.input(inviteMemberInput)
			.output(invitationRowSchema),
		revoke: base
			.route({
				method: 'DELETE',
				path: '/workos/org/invitations/{invitationId}',
				tags: ['WorkOS', 'Invitations'],
				summary: 'Revoke an invitation',
			})
			.input(revokeInvitationInput)
			.output(invitationRowSchema),
		resend: base
			.route({
				method: 'POST',
				path: '/workos/org/invitations/{invitationId}/resend',
				tags: ['WorkOS', 'Invitations'],
				summary: 'Resend an invitation',
			})
			.input(resendInvitationInput)
			.output(invitationRowSchema),
		listMine: base
			.route({
				method: 'GET',
				path: '/workos/invitations/mine',
				tags: ['WorkOS', 'Invitations'],
				summary: "List the current user's invitations to join organizations",
			})
			.output(z.array(myInvitationRowSchema)),
	},
	roles: {
		list: base
			.route({
				method: 'GET',
				path: '/workos/org/roles',
				tags: ['WorkOS', 'Roles'],
				summary: 'List roles available in the active organization',
			})
			.output(z.array(orgRoleSchema)),
	},
	user: {
		updateProfile: base
			.route({
				method: 'PATCH',
				path: '/workos/user',
				tags: ['WorkOS', 'User'],
				summary: 'Update the current user profile',
			})
			.input(updateProfileInput)
			.output(userSchema),
	},
} as const
