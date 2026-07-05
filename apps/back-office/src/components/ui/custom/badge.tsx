import * as C from '@lib/constants'
import { Badge as Base } from '@ui/badge'

/** @deprecated Prefer `@ui/badge` with the `type` prop instead of this wrapper. */
const PRJ = {
	PROJECT_STATUS: C.TOP_LEVEL_STATUS,
	EPIC_STATUS: C.TOP_LEVEL_STATUS,
	MILESTONE_STATUS: C.SUB_LEVEL_STATUS,
	SPRINT_STATUS: C.SUB_LEVEL_STATUS,
	TASK_STATUS: C.THIRD_LEVEL_STATUS,
	ISSUE_STATUS: C.THIRD_LEVEL_STATUS,
	TASK_PRIORITY: C.PRIORITY_STATUS,
	ISSUE_PRIORITY: C.PRIORITY_STATUS,
	ISSUE_TYPE: C.ISSUE_TYPE,
	PAYMENT_TERMS: C.PAYMENT_TERMS,
	ISSUE_RESOLUTION: C.ISSUE_RESOLUTION,
} as const

type StatusKey = (typeof PRJ)[keyof typeof PRJ][number]

interface StatusBadgeProps extends React.ComponentProps<typeof Base> {
	from?: keyof typeof PRJ
	status?: StatusKey
}

/** @deprecated Prefer `@ui/badge` with the `type` prop. */
export function Badge({ from: _from, status, ...props }: StatusBadgeProps) {
	if (status?.trim()) {
		return <Base type={status} {...props} />
	}
	return <Base {...props} />
}
