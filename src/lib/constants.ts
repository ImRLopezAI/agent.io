export const formatter = {
	enumToUI: (value: string) => {
		const readable = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
		if (!readable) return readable
		const acronyms = new Set([
			'AI',
			'API',
			'CSV',
			'ID',
			'OK',
			'SLA',
			'SSO',
			'URL',
		])
		return readable
			.split(' ')
			.map((word) => {
				const upper = word.toUpperCase()
				if (acronyms.has(upper)) return upper
				const lower = word.toLowerCase()
				return lower.charAt(0).toUpperCase() + lower.slice(1)
			})
			.join(' ')
	},
} as const

export const TOP_LEVEL_STATUS = [
	'ACTIVE',
	'INACTIVE',
	'ARCHIVED',
	'COMPLETED',
	'IN_PROGRESS',
	'ON_HOLD',
	'CANCELLED',
	' ',
] as const

export const SUB_LEVEL_STATUS = [
	'PENDING',
	'IN_PROGRESS',
	'COMPLETED',
	'DELAYED',
	'CANCELLED',
	' ',
] as const

export const THIRD_LEVEL_STATUS = [
	'BACKLOG',
	'READY_TO_WORK',
	'IN_PROGRESS',
	'REVIEW',
	'DONE',
	'CANCELLED',
	' ',
] as const

export const PRIORITY_STATUS = [
	'LOW',
	'MEDIUM',
	'HIGH',
	'CRITICAL',
	' ',
] as const

export const PROJECT_HEALTH_STATUS = [
	'ON_TRACK',
	'NO_UPDATES',
	'UPDATE_MISSING',
	'AT_RISK',
	'COMPLETED',
	'CANCELLED',
] as const

export const ISSUE_TYPE = [
	'EPIC',
	'STORY',
	'TASK',
	'BUG',
	'SUBTASK',
	' ',
] as const

export const SPRINT_STATUS = [
	'PLANNED',
	'ACTIVE',
	'COMPLETED',
	'CANCELLED',
	' ',
] as const

export const ISSUE_RESOLUTION = [
	'DONE',
	'WONT_FIX',
	'DUPLICATE',
	'CANNOT_REPRODUCE',
	'INCOMPLETE',
	' ',
] as const

export const PAYMENT_TERMS = [
	'PAYPALL',
	'STRIPE',
	'BANK_TRANSFER',
	'CRYPTO',
	'CASH',
	' ',
] as const

// Cedar Support Platform — new enums

export const TICKET_SOURCE = [
	'EMAIL',
	'CHAT',
	'PORTAL',
	'IMPORT',
	'MANUAL',
] as const

export const SLA_STATE = ['OK', 'WARN', 'RISK', 'BREACHED'] as const

export const EMAIL_BODY_FETCH_STATUS = ['PENDING', 'FETCHED', 'FAILED'] as const

export const EMAIL_MESSAGE_KIND = [
	'CUSTOMER',
	'AGENT',
	'NOTE',
	'SYSTEM',
] as const

export const CUSTOMER_TIER = [
	'ENTERPRISE',
	'BUSINESS',
	'GROWTH',
	'STARTER',
] as const

export const ROADMAP_LANE = [
	'MILESTONE',
	'COMMIT',
	'WORK',
	'DEPENDENCY',
	'ESCALATION',
] as const

/** WorkOS role slugs — lowercase to match the `role_slug` convention. */
export const USER_ROLE = ['admin', 'member', 'customer'] as const

export type StatusKey =
	| (typeof TOP_LEVEL_STATUS)[number]
	| (typeof SUB_LEVEL_STATUS)[number]
	| (typeof THIRD_LEVEL_STATUS)[number]
	| (typeof PRIORITY_STATUS)[number]
	| (typeof PROJECT_HEALTH_STATUS)[number]
	| (typeof ISSUE_TYPE)[number]
	| (typeof SPRINT_STATUS)[number]
	| (typeof ISSUE_RESOLUTION)[number]
	| (typeof PAYMENT_TERMS)[number]
	| (typeof TICKET_SOURCE)[number]
	| (typeof SLA_STATE)[number]
	| (typeof EMAIL_BODY_FETCH_STATUS)[number]
	| (typeof EMAIL_MESSAGE_KIND)[number]
	| (typeof CUSTOMER_TIER)[number]
	| (typeof ROADMAP_LANE)[number]
	| (typeof USER_ROLE)[number]
