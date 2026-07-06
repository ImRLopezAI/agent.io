'use client'

import { Button } from '@ui/button'
import { Ellipsis } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
	Combobox,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from '@/components/ui/combobox'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

import type { DynamicNavGroup, NavItem } from './items'
import { activateNavItem, getNavItemId } from './nav-utils'
import { useSidebarNavActions } from './sidebar-nav-store'

const menuButtonClassName =
	'[&>svg]:text-current hover:bg-(--primary)/10 hover:text-sidebar-foreground data-active:bg-(--primary)/10 data-active:text-sidebar-foreground '

type NavDynamicMoreProps = {
	group: DynamicNavGroup
	items: NavItem[]
	navigate: (to: string) => void
}

function NavItemIcon({ icon: Icon }: { icon: NonNullable<NavItem['icon']> }) {
	return <Icon className='size-4 shrink-0 text-current' />
}

function filterNavItems(items: NavItem[], query: string) {
	const normalized = query.trim().toLowerCase()
	if (!normalized) return items

	return items.filter((item) =>
		item.title.toLowerCase().includes(normalized),
	)
}

export function NavDynamicMore({
	group,
	items,
	navigate,
}: NavDynamicMoreProps) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const { push: pushStack } = useSidebarNavActions()

	const moreLabel = group.moreLabel ?? 'More'
	const searchPlaceholder =
		group.searchPlaceholder ?? `Search ${group.title.toLowerCase()}...`
	const viewAllLabel = group.viewAllLabel ?? 'View all'
	const filteredItems = useMemo(
		() => filterNavItems(items, search),
		[items, search],
	)

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen)
		if (!nextOpen) {
			setSearch('')
		}
	}

	const handleSelect = (item: NavItem | null) => {
		if (!item) return

		activateNavItem(item, { navigate, pushStack })
		handleOpenChange(false)
	}

	return (
		<SidebarMenuItem>
			<Popover onOpenChange={handleOpenChange} open={open}>
				<PopoverTrigger
					nativeButton={false}
					render={
						<SidebarMenuButton
							className={menuButtonClassName}
							title={moreLabel}
						>
							<Ellipsis className='size-4 shrink-0 text-current' /> {moreLabel}
						</SidebarMenuButton>
					}
				/>
				<PopoverContent
					align='start'
					className='w-80 gap-0 overflow-hidden p-0'
					side='right'
					sideOffset={12}
				>
					<Combobox<NavItem>
						filteredItems={filteredItems}
						inline
						inputValue={search}
						isItemEqualToValue={(a, b) => getNavItemId(a) === getNavItemId(b)}
						itemToStringLabel={(item) => item.title}
						items={items}
						onInputValueChange={setSearch}
						onValueChange={(value) => handleSelect(value)}
						open={open}
					>
						<div className='flex items-center gap-3 border-border border-b px-3 py-2'>
							<ComboboxInput
								autoFocus
								className='h-8 w-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-within:border-transparent focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0'
								placeholder={searchPlaceholder}
								showTrigger={false}
							/>
							{group.viewAllHref ? (
								<Button
									className='h-8 shrink-0 px-0 text-xs'
									onClick={() => {
										navigate(group.viewAllHref!)
										handleOpenChange(false)
									}}
									type='button'
									variant='link'
								>
									{viewAllLabel}
								</Button>
							) : null}
						</div>
						<ComboboxList className='max-h-72 w-full'>
							{(item: NavItem) => (
								<ComboboxItem
									className='**:data-[slot=item-indicator]:hidden'
									key={getNavItemId(item)}
									value={item}
								>
									{item.icon ? <NavItemIcon icon={item.icon} /> : null}
									<span className='truncate'>{item.title}</span>
								</ComboboxItem>
							)}
						</ComboboxList>
						<ComboboxEmpty className='flex w-full justify-center py-6 text-center text-sm text-muted-foreground'>
							No results found
						</ComboboxEmpty>
					</Combobox>
				</PopoverContent>
			</Popover>
		</SidebarMenuItem>
	)
}
