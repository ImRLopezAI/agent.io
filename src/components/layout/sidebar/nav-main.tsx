'use client'
import { ChevronRight } from 'lucide-react'
import type React from 'react'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useAppSidebar } from './context'
import type { BadgeTypes, NavItem } from './items'

export function NavMain() {
	const { isMobile } = useSidebar()
	const { items, navigate, pathname } = useAppSidebar()
	return (
		<>
			{items.map((nav) => {
				const items = nav.type === 'dynamic' ? nav.dynamicItems() : nav.items
				const maxDepth = nav.type === 'dynamic' ? 2 : 1
				const actions = nav.type === 'dynamic' ? nav.actions : undefined

				return (
					<SidebarGroup key={nav.title}>
						<div className='flex w-full items-center justify-between'>
							<SidebarGroupLabel>{nav.title}</SidebarGroupLabel>
							{typeof actions === 'function' ? actions() : actions}
						</div>
						<SidebarGroupContent className='flex flex-col gap-2'>
							<SidebarMenu>
								{items.map((item) => (
									<SidebarMenuItem key={item.title}>
										{Array.isArray(item.items) && item.items.length > 0 ? (
											<NavItemArray
												item={item}
												isMobile={isMobile}
												pathname={pathname}
												maxDepth={maxDepth}
												navigate={(to: string) => {
													navigate(to)
												}}
											/>
										) : (
											<SidebarMenuButton
												className='hover:bg-(--primary)/10 hover:text-sidebar-foreground data-active:bg-(--primary)/10 data-active:text-sidebar-foreground'
												isActive={pathname === item.href}
												title={item.title}
												onClick={() => {
													if (item.href) navigate(item.href)
												}}
											>
												{item.icon && <item.icon />}
												<span>{item.title}</span>
											</SidebarMenuButton>
										)}
										{item.badge && (
											<Badge
												type={item.badge}
												className={item.items?.length ? 'right-6' : undefined}
											/>
										)}
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)
			})}
		</>
	)
}

interface BadgeProps extends React.ComponentProps<typeof SidebarMenuBadge> {
	type: BadgeTypes
}
function Badge({ type, className, ...props }: BadgeProps) {
	const typeStyles: Record<typeof type, string> = {
		NEW: 'border border-green-400 text-green-600 peer-hover/menu-button:text-green-600 peer-data-active/menu-button:text-green-600',
		COMING:
			'opacity-50 peer-hover/menu-button:text-foreground peer-data-active/menu-button:text-foreground',
		WIP: 'border border-yellow-400 text-yellow-600 peer-hover/menu-button:text-yellow-600 peer-data-active/menu-button:text-yellow-600',
		UPDATED:
			'border border-blue-400 text-blue-600 peer-hover/menu-button:text-blue-600 peer-data-active/menu-button:text-blue-600 ',
	}
	const styles =
		typeStyles[type] ||
		'peer-hover/menu-button:text-foreground peer-data-active/menu-button:text-foreground'
	return (
		<SidebarMenuBadge className={cn('top-1.5', styles, className)} {...props}>
			{type}
		</SidebarMenuBadge>
	)
}

const dropdownItemClassName =
	'hover:bg-(--primary)/10 hover:text-sidebar-foreground! active:bg-(--primary)/10! active:text-sidebar-foreground'

function hasActiveItem(
	item: NavItem,
	pathname: string,
	maxDepth: number,
	depth = 0,
): boolean {
	if (item.href === pathname) return true
	if (depth >= maxDepth) return false
	return (
		item.items?.some((subItem) =>
			hasActiveItem(subItem, pathname, maxDepth, depth + 1),
		) ?? false
	)
}

function DropdownItems({
	items,
	navigate,
	maxDepth,
	depth = 0,
}: {
	items: NavItem[]
	navigate: (to: string) => void
	maxDepth: number
	depth?: number
}) {
	return (
		<>
			{items.map((dropdownItem) => {
				const hasChildren =
					depth < maxDepth &&
					Array.isArray(dropdownItem.items) &&
					dropdownItem.items.length > 0

				if (hasChildren) {
					return (
						<DropdownMenuSub key={dropdownItem.title}>
							<DropdownMenuSubTrigger
								className={dropdownItemClassName}
								closeDelay={150}
								delay={0}
								openOnHover
								render={
									<SidebarMenuSubButton
										className='w-full hover:bg-(--primary)/10 hover:text-sidebar-foreground active:bg-(--primary)/10 active:text-sidebar-foreground'
										isActive={false}
										title={dropdownItem.title}
									>
										{dropdownItem.icon && (
											<dropdownItem.icon className='me-2 size-4' />
										)}
										<span>{dropdownItem.title}</span>
										<ChevronRight className='ml-auto size-4 text-current!' />
									</SidebarMenuSubButton>
								}
							/>
							<DropdownMenuSubContent className='min-w-48 rounded-lg'>
								<DropdownMenuGroup>
									<DropdownItems
										items={dropdownItem.items ?? []}
										navigate={navigate}
										maxDepth={maxDepth}
										depth={depth + 1}
									/>
								</DropdownMenuGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					)
				}

				return (
					<DropdownMenuItem
						className={dropdownItemClassName}
						key={dropdownItem.title}
						onClick={() => {
							if (dropdownItem.href) navigate(dropdownItem.href)
						}}
					>
						{dropdownItem.icon && <dropdownItem.icon className='me-2 size-4' />}
						<span>{dropdownItem.title}</span>
					</DropdownMenuItem>
				)
			})}
		</>
	)
}

function NavSubItem({
	item,
	pathname,
	navigate,
	depth,
	maxDepth,
}: {
	item: NavItem
	pathname: string
	navigate: (to: string) => void
	depth: number
	maxDepth: number
}) {
	const hasChildren =
		depth < maxDepth && Array.isArray(item.items) && item.items.length > 0
	const isActive = hasActiveItem(item, pathname, maxDepth, depth)
	const subMenuClassName = cn(depth > 1 && 'mx-2')

	return (
		<SidebarMenuSubItem>
			{hasChildren ? (
				<Collapsible className='group/collapsible' defaultOpen={isActive}>
					<CollapsibleTrigger
						nativeButton={false}
						render={
							<SidebarMenuSubButton
								className='w-full hover:bg-(--primary)/10 hover:text-sidebar-foreground active:bg-(--primary)/10 active:text-sidebar-foreground'
								isActive={isActive}
								title={item.title}
							>
								{item.icon && (
									<item.icon
										className={cn(
											pathname === item.href && 'active:text-primary!',
										)}
									/>
								)}
								<span>{item.title}</span>
								<ChevronRight className='ml-auto text-current! transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
							</SidebarMenuSubButton>
						}
					/>
					<CollapsibleContent>
						<SidebarMenuSub className={subMenuClassName}>
							{item.items?.map((subItem) => (
								<NavSubItem
									key={subItem.title}
									item={subItem}
									pathname={pathname}
									navigate={navigate}
									depth={depth + 1}
									maxDepth={maxDepth}
								/>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</Collapsible>
			) : (
				<SidebarMenuSubButton
					className='w-full hover:bg-(--primary)/10 hover:text-sidebar-foreground active:bg-(--primary)/10 active:text-sidebar-foreground'
					isActive={pathname === item.href}
					title={item.title}
					onClick={() => {
						if (item.href) navigate(item.href)
					}}
				>
					{item.icon && (
						<item.icon
							className={cn(pathname === item.href && 'active:text-primary!')}
						/>
					)}
					<span>{item.title}</span>
				</SidebarMenuSubButton>
			)}
		</SidebarMenuSubItem>
	)
}

function NavItemArray({
	item,
	isMobile,
	pathname,
	maxDepth,
	navigate,
}: {
	item: NavItem
	isMobile: boolean
	pathname: string
	maxDepth: number
	navigate: (to: string) => void
}) {
	const isActive = hasActiveItem(item, pathname, maxDepth)

	return (
		<>
			<div className='hidden group-data-[collapsible=icon]:block'>
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger
						closeDelay={150}
						delay={0}
						openOnHover
						render={
							<SidebarMenuButton
								className='hover:bg-(--primary)/10 hover:text-sidebar-foreground data-active:bg-(--primary)/10 data-active:text-sidebar-foreground'
								isActive={isActive}
							>
								{item.icon && <item.icon />}
								<span>{item.title}</span>
								<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						side={isMobile ? 'bottom' : 'right'}
						align={isMobile ? 'end' : 'start'}
						className='min-w-48 rounded-lg'
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel>{item.title}</DropdownMenuLabel>
							<DropdownItems
								items={item.items ?? []}
								navigate={navigate}
								maxDepth={maxDepth}
							/>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Collapsible
				className='group/collapsible block group-data-[collapsible=icon]:hidden'
				defaultOpen={isActive}
			>
				<CollapsibleTrigger
					render={
						<SidebarMenuButton
							className='hover:bg-(--primary)/10 hover:text-sidebar-foreground data-active:bg-(--primary)/10 data-active:text-sidebar-foreground'
							isActive={isActive}
							title={item.title}
						>
							{item.icon && <item.icon />}
							<span>{item.title}</span>
							<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
						</SidebarMenuButton>
					}
				/>
				<CollapsibleContent>
					<SidebarMenuSub>
						{item.items?.map((subItem) => (
							<NavSubItem
								key={subItem.title}
								item={subItem}
								pathname={pathname}
								navigate={navigate}
								depth={1}
								maxDepth={maxDepth}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</Collapsible>
		</>
	)
}
