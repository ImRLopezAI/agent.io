'use client'

import { cn } from 'cnfast'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

function getSuggestionPosition(clientRect: (() => DOMRect | null) | null) {
	const rect = clientRect?.()
	if (!rect) return null
	return { top: rect.bottom + 8, left: rect.left }
}

export function SuggestionMenu<T extends { id: string; label: string }>({
	active,
	items,
	onSelect,
	renderItem,
	emptyLabel,
	clientRect,
}: {
	active: boolean
	items: T[]
	onSelect: (item: T) => void
	renderItem?: (item: T) => ReactNode
	emptyLabel: string
	clientRect: (() => DOMRect | null) | null
}) {
	const position = active ? getSuggestionPosition(clientRect) : null
	if (!active || !position) return null

	return createPortal(
		<ul
			role='listbox'
			className='fixed z-50 max-h-72 min-w-[220px] list-none overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-md'
			style={{ top: position.top, left: position.left }}
		>
			{items.length ? (
				items.map((item) => (
					<li key={item.id}>
						<button
							type='button'
							className={cn(
								'flex w-full items-center gap-2 px-3 py-2 text-left',
								'hover:bg-muted hover:text-foreground',
							)}
							onMouseDown={(event) => {
								event.preventDefault()
								onSelect(item)
							}}
						>
							{renderItem ? (
								renderItem(item)
							) : (
								<span className='min-w-0 truncate font-medium text-foreground text-sm'>
									{item.label}
								</span>
							)}
						</button>
					</li>
				))
			) : (
				<li className='px-3 py-2 text-muted-foreground text-sm'>
					{emptyLabel}
				</li>
			)}
		</ul>,
		document.body,
	)
}
