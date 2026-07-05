'use client'

import { useRouter } from '@tanstack/react-router'
import { Button } from '@ui/button'
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@ui/command'
import { SearchIcon } from 'lucide-react'
import React, { useState } from 'react'

import { useAppSidebar } from '@/components/layout/sidebar/context'

export default function Search() {
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const { items } = useAppSidebar()
	return (
		<div className='lg:flex-1'>
			<Button size='icon' variant='ghost' onClick={() => setOpen(true)}>
				<SearchIcon />
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				className='fixed top-1/8 w-full min-w-2/5 md:min-w-4/5 lg:min-w-3/5'
			>
				<Command>
					<CommandInput placeholder='Type a command or search...' />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						{items.map((item) => {
							const groupItems =
								item.type === 'dynamic' ? item.dynamicItems() : item.items

							return (
								<React.Fragment key={item.title}>
									<CommandGroup heading={item.title}>
										{groupItems.map((subItem, key) => (
											<CommandItem
												key={key}
												onSelect={() => {
													setOpen(false)
													router.navigate({
														to: subItem.href || '/',
													})
												}}
											>
												{subItem.icon && (
													<subItem.icon className='me-2 h-4 w-4 text-muted-foreground' />
												)}
												<span>{subItem.title}</span>
											</CommandItem>
										))}
									</CommandGroup>
									<CommandSeparator />
								</React.Fragment>
							)
						})}
					</CommandList>
				</Command>
			</CommandDialog>
		</div>
	)
}
