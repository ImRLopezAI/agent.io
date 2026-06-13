import type { NavGroup, NavItem, NavItemNavType } from './items'

export type { NavItemNavType }

export type NavStackFrame = {
	id: string
	title: string
	items: NavItem[]
	dynamicSource?: NavItem
}

export function getNavItemId(item: NavItem): string {
	return item.id ?? item.title
}

export function getNavItemChildren(item: NavItem): NavItem[] {
	return item.dynamicItems?.() ?? item.items ?? []
}

export function resolveNavType(item: NavItem): NavItemNavType {
	if (item.navType) return item.navType
	if (getNavItemChildren(item).length > 0) return 'dropdown'
	return 'link'
}

export function flattenNavGroups(groups: NavGroup[]): NavItem[] {
	return groups.flatMap((group) =>
		group.type === 'dynamic' ? group.dynamicItems() : group.items,
	)
}

export function findWrappedStackForPathname(
	groups: NavGroup[],
	pathname: string,
): NavStackFrame[] {
	const stack: NavStackFrame[] = []

	function search(items: NavItem[], frames: NavStackFrame[]): boolean {
		for (const item of items) {
			if (item.href === pathname) {
				stack.push(...frames)
				return true
			}

			const children = getNavItemChildren(item)
			if (children.length === 0) continue

			const navType = resolveNavType(item)
			const nextFrames =
				navType === 'wrapped'
					? [
							...frames,
							{
								id: getNavItemId(item),
								title: item.title,
								items: children,
								dynamicSource: item.dynamicItems ? item : undefined,
							},
						]
					: frames

			if (search(children, nextFrames)) return true
		}

		return false
	}

	search(flattenNavGroups(groups), [])
	return stack
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
