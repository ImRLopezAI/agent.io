import type {
	DynamicNavGroup,
	NavGroup,
	NavItem,
	NavItemNavType,
} from './items'

export type { NavItemNavType }

export type NavStackFrame = {
	id: string
	title: string
	items: NavItem[]
	source?: NavItem
	dynamicSource?: NavItem
}

export function getNavItemId(item: NavItem): string {
	return item.id ?? item.title
}

export function shouldShowWrappedIndicator(item: NavItem): boolean {
	return item.showWrappedIndicator !== false
}

export function createWrappedStackFrame(
	item: NavItem,
	children: NavItem[],
): NavStackFrame {
	return {
		id: getNavItemId(item),
		title: item.title,
		items: children,
		source: item,
		dynamicSource: item.dynamicItems ? item : undefined,
	}
}

export function openWrappedItem(
	item: NavItem,
	options: {
		navigate: (to: string) => void
		pushStack: (frame: NavStackFrame) => void
	},
): void {
	const children = getNavItemChildren(item)

	if (item.directNavigation && item.href) {
		options.navigate(item.href)
		return
	}

	options.pushStack(createWrappedStackFrame(item, children))
}

export function getNavGroupKey(group: NavGroup, index: number): string {
	return group.title ?? `nav-group-${index}`
}

export function getNavItemChildren(item: NavItem): NavItem[] {
	return item.dynamicItems?.() ?? item.items ?? []
}

export function resolveNavType(item: NavItem): NavItemNavType {
	if (item.navType) return item.navType
	if (getNavItemChildren(item).length > 0) return 'dropdown'
	return 'link'
}

export function resolveDynamicGroupItems(group: DynamicNavGroup): NavItem[] {
	if (group.navType === 'wrapped') {
		return [
			{
				id: group.title,
				title: group.title,
				icon: group.icon,
				navType: 'wrapped',
				wrappedHeader: group.wrappedHeader,
				dynamicItems: group.dynamicItems,
			},
		]
	}

	return group.dynamicItems()
}

export function splitDynamicGroupItems(
	group: DynamicNavGroup,
	items: NavItem[],
): { visible: NavItem[]; overflow: NavItem[] } {
	const { maxItems } = group
	if (maxItems == null || maxItems <= 0 || items.length <= maxItems) {
		return { visible: items, overflow: [] }
	}

	return {
		visible: items.slice(0, maxItems),
		overflow: items.slice(maxItems),
	}
}

export function activateNavItem(
	item: NavItem,
	options: {
		navigate: (to: string) => void
		pushStack: (frame: NavStackFrame) => void
	},
): void {
	const children = getNavItemChildren(item)
	const navType = resolveNavType(item)

	if (navType === 'wrapped' && children.length > 0) {
		openWrappedItem(item, options)
		return
	}

	if (item.href) {
		options.navigate(item.href)
	}
}

export function flattenNavGroups(groups: NavGroup[]): NavItem[] {
	return groups.flatMap((group) =>
		group.type === 'dynamic'
			? resolveDynamicGroupItems(group)
			: group.items,
	)
}

export function findWrappedStackForPathname(
	groups: NavGroup[],
	pathname: string,
): NavStackFrame[] {
	const stack: NavStackFrame[] = []

		function search(items: NavItem[], frames: NavStackFrame[]): boolean {
			for (const item of items) {
				const children = getNavItemChildren(item)
				const navType = resolveNavType(item)

				if (item.href === pathname) {
					if (
						item.directNavigation &&
						navType === 'wrapped' &&
						children.length > 0
					) {
						stack.push(...frames, createWrappedStackFrame(item, children))
					} else {
						stack.push(...frames)
					}
					return true
				}

				if (children.length === 0) continue

				const nextFrames =
					navType === 'wrapped'
						? [...frames, createWrappedStackFrame(item, children)]
						: frames

				if (search(children, nextFrames)) return true
			}

			return false
		}

	search(flattenNavGroups(groups), [])
	return stack
}

export function getWrappedStackKey(
	groups: NavGroup[],
	pathname: string,
): string {
	return findWrappedStackForPathname(groups, pathname)
		.map((frame) => frame.id)
		.join('/')
}

export function resolveStackFrameItems(frame: NavStackFrame): NavItem[] {
	return frame.dynamicSource?.dynamicItems?.() ?? frame.items
}

export function hasActiveItem(
	item: NavItem,
	pathname: string,
	maxDepth: number,
	depth = 0,
): boolean {
	if (item.href === pathname) return true
	if (depth >= maxDepth) return false
	return getNavItemChildren(item).some((subItem) =>
		hasActiveItem(subItem, pathname, maxDepth, depth + 1),
	)
}
