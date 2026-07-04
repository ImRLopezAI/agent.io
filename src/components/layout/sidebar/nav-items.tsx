'use client'

import { ArrowRightToLine, ChevronRight } from 'lucide-react'
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
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

import type { BadgeTypes, NavItem } from './items'
import {
	getNavItemChildren,
	getNavItemId,
	hasActiveItem,
	resolveNavType,
} from './nav-utils'
import { useSidebarNavActions } from './sidebar-nav-store'

const menuButtonClassName =
	'[&>svg]:text-current hover:bg-(--primary)/10 hover:text-sidebar-foreground data-active:bg-(--primary)/10 data-active:text-sidebar-foreground'

const subMenuButtonClassName =
	'w-full translate-x-0 gap-2 px-2 [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-(--primary)/10 hover:text-sidebar-foreground active:bg-(--primary)/10 active:text-sidebar-foreground'

const dropdownItemClassName =
	'hover:bg-(--primary)/10 hover:text-sidebar-foreground! active:bg-(--primary)/10! active:text-sidebar-foreground'

function NavItemIcon({ icon: Icon }: { icon: NonNullable<NavItem['icon']> }) {
	return <Icon className='size-4 shrink-0 text-current' />
}

function NavSubItemIcon({
	icon: Icon,
}: {
	icon: NonNullable<NavItem['icon']>
}) {
	return <Icon className='size-4 shrink-0 text-primary!' />
}

function WrappedRouteIndicator({
	className,
	primary,
}: {
	className?: string
	primary?: boolean
}) {
	return (
		<ArrowRightToLine
			className={cn(
				'ml-auto size-4 shrink-0',
				primary ? 'text-primary!' : 'text-current',
				className,
			)}
		/>
	)
}

type NavItemNodeProps = {
	item: NavItem
	pathname: string
	navigate: (to: string) => void
	isMobile: boolean
	maxDepth: number
	mode: 'root' | 'stack'
}

export function NavItemNode({
	item,
	pathname,
	navigate,
	isMobile,
	maxDepth,
	mode,
}: NavItemNodeProps) {
	const navType = resolveNavType(item)
	const children = getNavItemChildren(item)
	const hasChildren = children.length > 0

	return (
		<SidebarMenuItem>
			{navType === 'link' || !hasChildren ? (
				<NavLinkItem item={item} navigate={navigate} pathname={pathname} />
			) : navType === 'wrapped' ? (
				<NavWrappedItem
					isMobile={isMobile}
					item={item}
					maxDepth={maxDepth}
					mode={mode}
					navigate={navigate}
					pathname={pathname}
				/>
			) : (
				<NavDropdownItem
					isMobile={isMobile}
					item={item}
					maxDepth={maxDepth}
					mode={mode}
					navigate={navigate}
					pathname={pathname}
				/>
			)}
			{item.badge && (
				<NavBadge
					className={hasChildren ? 'right-6' : undefined}
					type={item.badge}
				/>
			)}
		</SidebarMenuItem>
	)
}

function NavLinkItem({
	item,
	pathname,
	navigate,
}: {
	item: NavItem
	pathname: string
	navigate: (to: string) => void
}) {
	return (
		<SidebarMenuButton
			className={menuButtonClassName}
			isActive={pathname === item.href}
			title={item.title}
			onClick={() => {
				if (item.href) navigate(item.href)
			}}
		>
			{item.icon && <NavItemIcon icon={item.icon} />}
			<span>{item.title}</span>
		</SidebarMenuButton>
	)
}

function NavWrappedItem({
	item,
	pathname,
	navigate,
	isMobile,
	maxDepth,
	mode,
}: {
	item: NavItem
	pathname: string
	navigate: (to: string) => void
	isMobile: boolean
	maxDepth: number
	mode: 'root' | 'stack'
}) {
	const { push: pushStack } = useSidebarNavActions()
	const children = getNavItemChildren(item)
	const isActive = hasActiveItem(item, pathname, maxDepth)

	const openWrapped = () => {
		pushStack({
			id: getNavItemId(item),
			title: item.title,
			items: children,
			dynamicSource: item.dynamicItems ? item : undefined,
		})
	}

	if (mode === 'root') {
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
									className={menuButtonClassName}
									isActive={isActive}
								>
									{item.icon && <NavItemIcon icon={item.icon} />}
									<span>{item.title}</span>
									<WrappedRouteIndicator />
								</SidebarMenuButton>
							}
						/>
						<DropdownMenuContent
							align={isMobile ? 'end' : 'start'}
							className='min-w-48 rounded-lg'
							side={isMobile ? 'bottom' : 'right'}
						>
							<DropdownMenuGroup>
								<DropdownMenuLabel>{item.title}</DropdownMenuLabel>
								<DropdownNavItems
									items={children}
									maxDepth={maxDepth}
									navigate={navigate}
								/>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<SidebarMenuButton
					className={cn(
						menuButtonClassName,
						'group-data-[collapsible=icon]:hidden',
					)}
					isActive={isActive}
					title={item.title}
					onClick={openWrapped}
				>
					{item.icon && <NavItemIcon icon={item.icon} />}
					<span>{item.title}</span>
					<WrappedRouteIndicator />
				</SidebarMenuButton>
			</>
		)
	}

	return (
		<SidebarMenuButton
			className={menuButtonClassName}
			isActive={isActive}
			title={item.title}
			onClick={openWrapped}
		>
			{item.icon && <NavItemIcon icon={item.icon} />}
			<span>{item.title}</span>
			<WrappedRouteIndicator />
		</SidebarMenuButton>
	)
}

function NavDropdownItem({
	item,
	pathname,
	navigate,
	isMobile,
	maxDepth,
	mode,
}: {
	item: NavItem
	pathname: string
	navigate: (to: string) => void
	isMobile: boolean
	maxDepth: number
	mode: 'root' | 'stack'
}) {
	const children = getNavItemChildren(item)
	const isActive = hasActiveItem(item, pathname, maxDepth)

	if (mode === 'stack') {
		return (
			<Collapsible className='group/collapsible' defaultOpen={isActive}>
				<CollapsibleTrigger
					nativeButton={false}
					render={
						<SidebarMenuButton
							className={menuButtonClassName}
							isActive={isActive}
							title={item.title}
						>
							{item.icon && <NavItemIcon icon={item.icon} />}
							<span>{item.title}</span>
							<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
						</SidebarMenuButton>
					}
				/>
				<CollapsibleContent>
					<SidebarMenuSub className='mx-2 gap-0.5 border-sidebar-border border-l px-2 py-0.5'>
						{children.map((subItem) => (
							<NavSubItemNode
								depth={1}
								item={subItem}
								key={subItem.id ?? subItem.title}
								maxDepth={maxDepth}
								navigate={navigate}
								pathname={pathname}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</Collapsible>
		)
	}

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
								className={menuButtonClassName}
								isActive={isActive}
							>
								{item.icon && <NavItemIcon icon={item.icon} />}
								<span>{item.title}</span>
								<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						align={isMobile ? 'end' : 'start'}
						className='min-w-48 rounded-lg'
						side={isMobile ? 'bottom' : 'right'}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel>{item.title}</DropdownMenuLabel>
							<DropdownNavItems
								items={children}
								maxDepth={maxDepth}
								navigate={navigate}
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
							className={menuButtonClassName}
							isActive={isActive}
							title={item.title}
						>
							{item.icon && <NavItemIcon icon={item.icon} />}
							<span>{item.title}</span>
							<ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
						</SidebarMenuButton>
					}
				/>
				<CollapsibleContent>
					<SidebarMenuSub className='mx-2 gap-0.5 border-sidebar-border border-l px-2 py-0.5'>
						{children.map((subItem) => (
							<NavSubItemNode
								depth={1}
								item={subItem}
								key={subItem.id ?? subItem.title}
								maxDepth={maxDepth}
								navigate={navigate}
								pathname={pathname}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</Collapsible>
		</>
	)
}

function NavSubItemNode({
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
	const navType = resolveNavType(item)
	const children = getNavItemChildren(item)
	const hasChildren = children.length > 0 && depth < maxDepth
	const isActive = hasActiveItem(item, pathname, maxDepth, depth)
	const { push: pushStack } = useSidebarNavActions()

	if (navType === 'wrapped' && hasChildren) {
		return (
			<SidebarMenuSubItem>
				<SidebarMenuSubButton
					className={subMenuButtonClassName}
					isActive={isActive}
					title={item.title}
					onClick={() => {
						pushStack({
							id: getNavItemId(item),
							title: item.title,
							items: children,
							dynamicSource: item.dynamicItems ? item : undefined,
						})
					}}
				>
					{item.icon && <NavSubItemIcon icon={item.icon} />}
					<span>{item.title}</span>
					<WrappedRouteIndicator primary />
				</SidebarMenuSubButton>
			</SidebarMenuSubItem>
		)
	}

	if (hasChildren && navType === 'dropdown') {
		return (
			<SidebarMenuSubItem>
				<Collapsible className='group/collapsible' defaultOpen={isActive}>
					<CollapsibleTrigger
						nativeButton={false}
						render={
							<SidebarMenuSubButton
								className={subMenuButtonClassName}
								isActive={isActive}
								title={item.title}
							>
								{item.icon && <NavSubItemIcon icon={item.icon} />}
								<span>{item.title}</span>
								<ChevronRight className='ml-auto size-4 shrink-0 text-current transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
							</SidebarMenuSubButton>
						}
					/>
					<CollapsibleContent>
						<SidebarMenuSub
							className={cn(
								'mx-2 gap-0.5 border-sidebar-border border-l px-2 py-0.5',
								depth > 1 && 'ms-2',
							)}
						>
							{children.map((subItem) => (
								<NavSubItemNode
									depth={depth + 1}
									item={subItem}
									key={subItem.id ?? subItem.title}
									maxDepth={maxDepth}
									navigate={navigate}
									pathname={pathname}
								/>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</Collapsible>
			</SidebarMenuSubItem>
		)
	}

	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				className={subMenuButtonClassName}
				isActive={pathname === item.href}
				title={item.title}
				onClick={() => {
					if (item.href) navigate(item.href)
				}}
			>
				{item.icon && <NavSubItemIcon icon={item.icon} />}
				<span>{item.title}</span>
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	)
}

function DropdownNavItems({
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
				const children = getNavItemChildren(dropdownItem)
				const hasChildren = depth < maxDepth && children.length > 0
				const navType = resolveNavType(dropdownItem)

				if (hasChildren && navType === 'dropdown') {
					return (
						<DropdownMenuSub key={dropdownItem.id ?? dropdownItem.title}>
							<DropdownMenuSubTrigger
								className={dropdownItemClassName}
								closeDelay={150}
								delay={0}
								openOnHover
								render={
									<SidebarMenuSubButton
										className={subMenuButtonClassName}
										isActive={false}
										title={dropdownItem.title}
									>
										{dropdownItem.icon && (
											<NavSubItemIcon icon={dropdownItem.icon} />
										)}
										<span>{dropdownItem.title}</span>
										<ChevronRight className='ml-auto size-4 shrink-0 text-current' />
									</SidebarMenuSubButton>
								}
							/>
							<DropdownMenuSubContent className='min-w-48 rounded-lg'>
								<DropdownMenuGroup>
									<DropdownNavItems
										depth={depth + 1}
										items={children}
										maxDepth={maxDepth}
										navigate={navigate}
									/>
								</DropdownMenuGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					)
				}

				if (hasChildren && navType === 'wrapped') {
					return children.map((child) => (
						<DropdownMenuItem
							className={dropdownItemClassName}
							key={child.id ?? child.title}
							onClick={() => {
								if (child.href) navigate(child.href)
							}}
						>
							{child.icon && <NavSubItemIcon icon={child.icon} />}
							<span>{child.title}</span>
						</DropdownMenuItem>
					))
				}

				return (
					<DropdownMenuItem
						className={dropdownItemClassName}
						key={dropdownItem.id ?? dropdownItem.title}
						onClick={() => {
							if (dropdownItem.href) navigate(dropdownItem.href)
						}}
					>
						{dropdownItem.icon && <NavSubItemIcon icon={dropdownItem.icon} />}
						<span>{dropdownItem.title}</span>
					</DropdownMenuItem>
				)
			})}
		</>
	)
}

interface NavBadgeProps extends React.ComponentProps<typeof SidebarMenuBadge> {
	type: BadgeTypes
}

function NavBadge({ type, className, ...props }: NavBadgeProps) {
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

export function NavGroupMenu({
	items,
	pathname,
	navigate,
	isMobile,
	maxDepth,
}: {
	items: NavItem[]
	pathname: string
	navigate: (to: string) => void
	isMobile: boolean
	maxDepth: number
}) {
	return (
		<SidebarMenu>
			{items.map((item) => (
				<NavItemNode
					isMobile={isMobile}
					item={item}
					key={item.id ?? item.title}
					maxDepth={maxDepth}
					mode='root'
					navigate={navigate}
					pathname={pathname}
				/>
			))}
		</SidebarMenu>
	)
}
