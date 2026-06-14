'use client'

import { cn } from '@lib/utils'
import type { InvitationRow } from '@server/rpc/contracts/work-os.contract'
import { useMutation } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { RotateCw, X } from 'lucide-react'
import { toast } from 'sonner'

import { useOrgOpts } from '@/app/_shell/modules/utils/use-org-opts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TableCell, TableRow } from '@/components/ui/table'

export type OrganizationInvitationRowProps = {
	invitation: InvitationRow
}

const stateBadgeClasses: Record<InvitationRow['state'], string> = {
	pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	expired: 'bg-muted text-muted-foreground',
	revoked: 'bg-destructive/10 text-destructive',
}

/**
 * One invitation row: email, role, an expiry timestamp, and a `state` badge.
 *
 * Revoke + resend controls render ONLY for a `pending` invitation AND only for
 * an admin (gated on the session `role` from route context — the server
 * enforces the same via the `admin` middleware). Revoke is an optimistic
 * mutation that removes the row from the org-scoped invitations cache; resend is
 * a non-optimistic fire-and-toast.
 */
export function OrganizationInvitationRow({
	invitation,
}: OrganizationInvitationRowProps) {
	const { auth } = useRouteContext({ from: '/_shell' })
	const { invitations } = useOrgOpts()

	const { mutate: revoke, isPending: isRevoking } = useMutation(
		invitations.revoke(),
	)
	const { mutate: resend, isPending: isResending } = useMutation({
		...invitations.resend(),
		onSuccess: () => toast.success('Invitation resent'),
	})

	const isAdmin = auth.role === 'admin'
	const showActions = isAdmin && invitation.state === 'pending'

	return (
		<TableRow>
			<TableCell className='font-medium text-sm'>{invitation.email}</TableCell>

			<TableCell className='whitespace-nowrap text-muted-foreground text-xs tabular-nums'>
				{new Date(invitation.expiresAt).toLocaleString(undefined, {
					dateStyle: 'short',
					timeStyle: 'short',
				})}
			</TableCell>

			<TableCell className='text-sm'>{invitation.roleSlug ?? '—'}</TableCell>

			<TableCell className='text-sm'>
				<Badge
					variant='secondary'
					className={cn(stateBadgeClasses[invitation.state])}
				>
					{invitation.state}
				</Badge>
			</TableCell>

			<TableCell className='text-end'>
				{showActions && (
					<div className='flex items-center justify-end gap-1'>
						<Button
							size='icon'
							variant='outline'
							className='size-8'
							disabled={isResending}
							onClick={() => resend({ invitationId: invitation.id })}
							aria-label='Resend invitation'
						>
							{isResending ? <Spinner /> : <RotateCw />}
						</Button>

						<Button
							size='icon'
							variant='outline'
							className='size-8 text-destructive'
							disabled={isRevoking}
							onClick={() => revoke({ invitationId: invitation.id })}
							aria-label='Revoke invitation'
						>
							{isRevoking ? <Spinner /> : <X />}
						</Button>
					</div>
				)}
			</TableCell>
		</TableRow>
	)
}
