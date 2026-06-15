'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'

import { useComposedRef } from '#/components/editor/hooks/use-composed-ref'
import { useMenuNavigation } from '#/components/editor/hooks/use-menu-navigation'
import { Separator } from '#/components/editor/tiptap-ui-primitive/separator'
import { cn } from '#/lib/tiptap-utils'

type BaseProps = React.HTMLAttributes<HTMLDivElement>

interface ToolbarProps extends BaseProps {
	variant?: 'floating' | 'fixed'
}

const useToolbarNavigation = (
	toolbarRef: React.RefObject<HTMLDivElement | null>,
) => {
	const [items, setItems] = useState<HTMLElement[]>([])

	const collectItems = useCallback(() => {
		if (!toolbarRef.current) return []
		return Array.from(
			toolbarRef.current.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled])',
			),
		)
	}, [toolbarRef])

	useEffect(() => {
		const toolbar = toolbarRef.current
		if (!toolbar) return

		const updateItems = () => setItems(collectItems())

		updateItems()
		const observer = new MutationObserver(updateItems)
		observer.observe(toolbar, { childList: true, subtree: true })

		return () => observer.disconnect()
	}, [collectItems, toolbarRef])

	const { selectedIndex } = useMenuNavigation<HTMLElement>({
		containerRef: toolbarRef,
		items,
		orientation: 'horizontal',
		onSelect: (el) => el.click(),
		autoSelectFirstItem: false,
	})

	useEffect(() => {
		const toolbar = toolbarRef.current
		if (!toolbar) return

		const handleFocus = (e: FocusEvent) => {
			const target = e.target as HTMLElement
			if (toolbar.contains(target))
				target.setAttribute('data-focus-visible', 'true')
		}

		const handleBlur = (e: FocusEvent) => {
			const target = e.target as HTMLElement
			if (toolbar.contains(target)) target.removeAttribute('data-focus-visible')
		}

		toolbar.addEventListener('focus', handleFocus, true)
		toolbar.addEventListener('blur', handleBlur, true)

		return () => {
			toolbar.removeEventListener('focus', handleFocus, true)
			toolbar.removeEventListener('blur', handleBlur, true)
		}
	}, [toolbarRef])

	useEffect(() => {
		if (selectedIndex !== undefined && items[selectedIndex]) {
			items[selectedIndex].focus()
		}
	}, [selectedIndex, items])
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
	({ children, className, variant = 'fixed', ...props }, ref) => {
		const toolbarRef = useRef<HTMLDivElement>(null)
		const composedRef = useComposedRef(toolbarRef, ref)
		useToolbarNavigation(toolbarRef)

		return (
			<div
				ref={composedRef}
				role='toolbar'
				aria-label='toolbar'
				data-variant={variant}
				className={cn(
					'flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-background p-1 text-foreground data-[variant=floating]:border data-[variant=floating]:border-border data-[variant=floating]:bg-popover data-[variant=floating]:shadow-lg',
					className,
				)}
				{...props}
			>
				{children}
			</div>
		)
	},
)
Toolbar.displayName = 'Toolbar'

export const ToolbarGroup = forwardRef<HTMLDivElement, BaseProps>(
	({ children, className, ...props }, ref) => (
		<fieldset
			ref={ref}
			className={cn(
				'm-0 flex min-w-0 items-center gap-0.5 border-0 p-0',
				className,
			)}
			{...props}
		>
			{children}
		</fieldset>
	),
)
ToolbarGroup.displayName = 'ToolbarGroup'

export const ToolbarSeparator = forwardRef<HTMLDivElement, BaseProps>(
	({ ...props }, ref) => (
		<Separator ref={ref} orientation='vertical' decorative {...props} />
	),
)
ToolbarSeparator.displayName = 'ToolbarSeparator'
