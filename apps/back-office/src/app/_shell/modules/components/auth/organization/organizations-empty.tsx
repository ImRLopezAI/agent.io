'use client'

import { Briefcase } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type OrganizationsEmptyProps = {
	onCreatePress: () => void
}

export function OrganizationsEmpty({ onCreatePress }: OrganizationsEmptyProps) {
	return (
		<div className='flex flex-col items-center gap-4 p-4 text-center'>
			<div className='flex size-12 items-center justify-center rounded-full bg-muted'>
				<Briefcase className='size-5' />
			</div>

			<div className='flex flex-col gap-2'>
				<p className='font-semibold text-foreground text-sm'>
					No organizations
				</p>

				<span className='text-muted-foreground text-sm'>
					You aren't a member of any organization yet.
				</span>
			</div>

			<Button size='sm' onClick={onCreatePress}>
				Create organization
			</Button>
		</div>
	)
}
