import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const SLUG_CLEAN_REGEX = /[^a-z0-9]+/g
const SLUG_TRIM_REGEX = /^-|-$/g

function toSlug(label: string): string {
	return label
		.toLowerCase()
		.replace(SLUG_CLEAN_REGEX, '-')
		.replace(SLUG_TRIM_REGEX, '')
}

interface RowContextMenuItemBase<TData> {
	id?: string
	label: string
	icon?: LucideIcon
	shortcut?: string
	variant?: 'default' | 'destructive'
	disabled?: boolean | ((row: TData) => boolean)
	hidden?: boolean | ((row: TData) => boolean)
}

export type RowContextMenuAction<TData> = RowContextMenuItemBase<TData> & {
	type?: never
	onAction: (row: TData) => void
}

export type RowContextMenuLink<TData> = RowContextMenuItemBase<TData> & {
	type: 'link'
	to: string | ((row: TData) => string)
	external?: boolean
}

export type RowContextMenuComponent<TData> = RowContextMenuItemBase<TData> & {
	type: 'component'
	component: (props: {
		row: TData
		open: boolean
		onOpenChange: (open: boolean) => void
		onClose: () => void
	}) => ReactNode
}

export interface RowContextMenuSeparator {
	type: 'separator'
	id?: string
}

export type RowContextMenuItem<TData> =
	| RowContextMenuAction<TData>
	| RowContextMenuLink<TData>
	| RowContextMenuComponent<TData>
	| RowContextMenuSeparator

export function getItemId<TData>(
	item: RowContextMenuItem<TData>,
	index: number,
): string {
	if (item.type === 'separator') {
		return item.id ?? `separator-${index}`
	}
	return item.id ?? toSlug(item.label)
}

export function isItemDisabled<TData>(
	item: Exclude<RowContextMenuItem<TData>, RowContextMenuSeparator>,
	row: TData,
): boolean {
	return typeof item.disabled === 'function'
		? item.disabled(row)
		: !!item.disabled
}

export function isItemHidden<TData>(
	item: Exclude<RowContextMenuItem<TData>, RowContextMenuSeparator>,
	row: TData,
): boolean {
	return typeof item.hidden === 'function' ? item.hidden(row) : !!item.hidden
}

export function isSeparator<TData>(
	item: RowContextMenuItem<TData>,
): item is RowContextMenuSeparator {
	return item.type === 'separator'
}

export function isAction<TData>(
	item: RowContextMenuItem<TData>,
): item is RowContextMenuAction<TData> {
	return !('type' in item) || item.type === undefined
}

export function isLink<TData>(
	item: RowContextMenuItem<TData>,
): item is RowContextMenuLink<TData> {
	return item.type === 'link'
}

export function isComponent<TData>(
	item: RowContextMenuItem<TData>,
): item is RowContextMenuComponent<TData> {
	return item.type === 'component'
}

export function getLinkUrl<TData>(
	item: RowContextMenuLink<TData>,
	row: TData,
): string {
	return typeof item.to === 'function' ? item.to(row) : item.to
}
