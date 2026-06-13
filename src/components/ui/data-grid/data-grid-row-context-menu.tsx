'use client'

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from './ui/context-menu'
import {
	getItemId,
	getLinkUrl,
	isAction,
	isComponent,
	isItemDisabled,
	isItemHidden,
	isLink,
	isSeparator,
	type RowContextMenuComponent,
	type RowContextMenuItem,
} from '@ui/data-grid/lib/data-grid-row-context'
import * as React from 'react'
import { createPortal } from 'react-dom'

type MenuPosition = {
	x: number
	y: number
}

type RowContextMenuState<TData> = {
	row: TData | null
	position: MenuPosition | null
}

type ComponentState<TData> = {
	item: RowContextMenuComponent<TData>
	row: TData
}

type RowContextMenuRendererProps<TData> = {
	items?: RowContextMenuItem<TData>[]
	state: RowContextMenuState<TData>
	closeMenu: () => void
	componentState: ComponentState<TData> | null
	openComponent: (item: RowContextMenuComponent<TData>, row: TData) => void
	closeComponent: () => void
}

function RowContextMenuRenderer<TData>({
	items,
	state,
	closeMenu,
	componentState,
	openComponent,
	closeComponent,
}: RowContextMenuRendererProps<TData>) {
	const isOpen = Boolean(items?.length && state.row && state.position)
	const menuRow = state.row

	if (!isOpen && !componentState) return null

	return (
		<>
			{isOpen &&
				createPortal(
					<ContextMenu
						open
						onOpenChange={(open) => {
							if (!open) closeMenu()
						}}
					>
						<div
							data-context-menu-anchor
							style={{
								position: 'fixed',
								left: state.position?.x,
								top: state.position?.y,
								width: 0,
								height: 0,
							}}
						/>
						<ContextMenuContent
							className='w-48'
							style={{
								position: 'fixed',
								left: state.position?.x,
								top: state.position?.y,
							}}
						>
							{items?.map((item, index) => {
								const itemId = getItemId(item, index)

								if (isSeparator(item)) {
									return <ContextMenuSeparator key={itemId} />
								}

								if (isItemHidden(item, menuRow!)) return null

								const Icon = item.icon
								const disabled = isItemDisabled(item, menuRow!)

								if (isLink(item)) {
									const url = getLinkUrl(item, menuRow!)
									return (
										<ContextMenuItem
											key={itemId}
											disabled={disabled}
											variant={item.variant}
											onClick={() => {
												if (item.external) {
													window.open(url, '_blank', 'noopener,noreferrer')
												} else {
													window.location.href = url
												}
												closeMenu()
											}}
										>
											{Icon && <Icon className='mr-2 size-4' />}
											{item.label}
											{item.shortcut && (
												<span className='ml-auto text-muted-foreground text-xs'>
													{item.shortcut}
												</span>
											)}
										</ContextMenuItem>
									)
								}

								if (isComponent(item)) {
									return (
										<ContextMenuItem
											key={itemId}
											disabled={disabled}
											variant={item.variant}
											onClick={() => {
												openComponent(item, menuRow!)
												closeMenu()
											}}
										>
											{Icon && <Icon className='mr-2 size-4' />}
											{item.label}
											{item.shortcut && (
												<span className='ml-auto text-muted-foreground text-xs'>
													{item.shortcut}
												</span>
											)}
										</ContextMenuItem>
									)
								}

								if (isAction(item)) {
									return (
										<ContextMenuItem
											key={itemId}
											disabled={disabled}
											variant={item.variant}
											onClick={() => {
												item.onAction(menuRow!)
												closeMenu()
											}}
										>
											{Icon && <Icon className='mr-2 size-4' />}
											{item.label}
											{item.shortcut && (
												<span className='ml-auto text-muted-foreground text-xs'>
													{item.shortcut}
												</span>
											)}
										</ContextMenuItem>
									)
								}

								return null
							})}
						</ContextMenuContent>
					</ContextMenu>,
					document.body,
				)}

			{componentState?.item.component({
				row: componentState.row,
				open: true,
				onOpenChange: (isOpen) => !isOpen && closeComponent(),
				onClose: closeComponent,
			})}
		</>
	)
}

export function useRowContextMenu<TData>(items?: RowContextMenuItem<TData>[]) {
	const [state, setState] = React.useState<RowContextMenuState<TData>>({
		row: null,
		position: null,
	})
	const [componentState, setComponentState] =
		React.useState<ComponentState<TData> | null>(null)

	const openMenu = React.useCallback(
		(row: TData, position: MenuPosition) => {
			if (!items?.length) return
			setState({ row, position })
		},
		[items],
	)

	const closeMenu = React.useCallback(() => {
		setState({ row: null, position: null })
	}, [])

	const openComponent = React.useCallback(
		(item: RowContextMenuComponent<TData>, row: TData) => {
			setComponentState({ item, row })
		},
		[],
	)

	const closeComponent = React.useCallback(() => {
		setComponentState(null)
	}, [])

	const menu = (
		<RowContextMenuRenderer
			items={items}
			state={state}
			closeMenu={closeMenu}
			componentState={componentState}
			openComponent={openComponent}
			closeComponent={closeComponent}
		/>
	)

	return { openMenu, menu }
}
