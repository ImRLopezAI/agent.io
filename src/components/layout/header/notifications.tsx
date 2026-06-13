'use client'

import type {
	NOTIFICATIONS_SEVERITIES,
	NOTIFICATIONS_STATUSES,
} from '@lib/constants'
import { convexQuery, rpc, useQuery } from '@lib/rpc'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@ui/dropdown-menu'
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@ui/empty'
import { Spinner } from '@ui/spinner'
import { format } from 'date-fns'
import { Bell, ClockIcon } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
export function Notifications() {
	const { data: notifications = [], isLoading } = useQuery(
		convexQuery(rpc.notifications.list, {}),
	)
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const severity: Record<
		(typeof NOTIFICATIONS_SEVERITIES)[number],
		React.ComponentProps<typeof Badge>['variant']
	> = {
		low: 'success',
		medium: 'warning',
		high: 'error',
		critical: 'destructive',
	}
	const status: Record<
		(typeof NOTIFICATIONS_STATUSES)[number],
		React.ComponentProps<typeof Badge>['variant']
	> = {
		open: 'warning',
		investigating: 'info',
		resolved: 'success',
		escalated: 'destructive',
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={
					<Button variant='ghost' size='icon' aria-label='Notifications'>
						<Bell />
					</Button>
				}
			/>
			<DropdownMenuGroup>
				<DropdownMenuContent className='scrollbar-card w-80' align='end'>
					<DropdownMenuLabel>NOTIFICATIONSs</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{notifications.length === 0 && (
						<Empty>
							<EmptyHeader>
								<EmptyMedia />
								<EmptyTitle>No Alerts</EmptyTitle>
								<EmptyDescription>
									{isLoading && (
										<div className='flex w-full items-center justify-center p-4'>
											<Spinner />
										</div>
									)}
									{!isLoading && 'You have no alerts at this time.'}
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent />
						</Empty>
					)}

					<div className='max-h-96 overflow-auto'>
						{notifications.map((item) => (
							<DropdownMenuItem
								key={item._id}
								className='group flex flex-col gap-1 data-highlighted:bg-card-foreground/50'
								onSelect={() => {
									setOpen(false)
									router.navigate({ to: `/alerts/${item._id}` })
								}}
							>
								<div className='flex w-full flex-1 flex-col gap-1'>
									<div className='truncate font-medium text-sm data-highlighted:text-default-800'>
										{item.title}
									</div>
									<div className='line-clamp-1 text-muted-foreground text-xs data-highlighted:text-default-700'>
										{item.message}
									</div>
									<div className='flex items-center gap-2'>
										<Badge variant={severity[item.severity]}>
											{item.severity.toUpperCase()}
										</Badge>
										<Badge variant={status[item.status]}>
											{item.status.toUpperCase().replace(/_/g, ' ')}
										</Badge>
									</div>
									<div className='flex items-center gap-1 text-muted-foreground text-xs data-highlighted:text-default-500'>
										<ClockIcon className='size-3!' />
										{format(new Date(item._creationTime), 'MMM d, yyyy h:mm a')}
									</div>
								</div>
							</DropdownMenuItem>
						))}
					</div>
				</DropdownMenuContent>
			</DropdownMenuGroup>
		</DropdownMenu>
	)
}
