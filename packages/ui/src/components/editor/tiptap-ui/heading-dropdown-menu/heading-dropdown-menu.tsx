'use client'

import type { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { forwardRef, useCallback } from 'react'

// --- Hooks ---
import { useTiptapEditor } from '#/components/editor/hooks/use-tiptap-editor'
// --- Icons ---
import { ChevronDownIcon } from '#/components/editor/tiptap-icons/chevron-down-icon'
// --- Tiptap UI ---
import { HeadingButton } from '#/components/editor/tiptap-ui/heading-button'
import type { UseHeadingDropdownMenuConfig } from '#/components/editor/tiptap-ui/heading-dropdown-menu'
import { useHeadingDropdownMenu } from '#/components/editor/tiptap-ui/heading-dropdown-menu'
// --- UI Primitives ---
import type { ButtonProps } from '#/components/editor/tiptap-ui-primitive/button'
import { Button } from '#/components/editor/tiptap-ui-primitive/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#/components/editor/tiptap-ui-primitive/dropdown-menu'

export interface HeadingDropdownMenuProps
	extends Omit<ButtonProps, 'type'>,
		UseHeadingDropdownMenuConfig {
	/**
	 * Callback for when the dropdown opens or closes
	 */
	onOpenChange?: (isOpen: boolean) => void
	/**
	 * Whether the dropdown should use a modal
	 */
	modal?: boolean
}

/**
 * Dropdown menu component for selecting heading levels in a Tiptap editor.
 *
 * For custom dropdown implementations, use the `useHeadingDropdownMenu` hook instead.
 */
export const HeadingDropdownMenu = forwardRef<
	HTMLButtonElement,
	HeadingDropdownMenuProps
>(
	(
		{
			editor: providedEditor,
			levels = [1, 2, 3, 4, 5, 6],
			hideWhenUnavailable = false,
			onOpenChange,
			children,
			modal = true,
			...buttonProps
		},
		ref,
	) => {
		const { editor } = useTiptapEditor(providedEditor)
		const { isVisible, isActive, canToggle, Icon } = useHeadingDropdownMenu({
			editor,
			levels,
			hideWhenUnavailable,
		})

		const handleOpenChange = useCallback(
			(open: boolean, eventDetails: MenuPrimitive.Root.ChangeEventDetails) => {
				if (open && (!editor || !canToggle)) {
					eventDetails.cancel()
					return
				}
				onOpenChange?.(open)
			},
			[canToggle, editor, onOpenChange],
		)

		if (!isVisible) {
			return null
		}

		return (
			<DropdownMenu modal={modal} onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger
					disabled={!canToggle}
					nativeButton={true}
					render={
						<Button
							type='button'
							variant='ghost'
							data-active-state={isActive ? 'on' : 'off'}
							role='button'
							tabIndex={-1}
							disabled={!canToggle}
							data-disabled={!canToggle}
							aria-label='Format text as heading'
							aria-pressed={isActive}
							tooltip='Heading'
							showTooltip={false}
							{...buttonProps}
							ref={ref}
						>
							{children ? (
								children
							) : (
								<>
									<Icon className='tiptap-button-icon' />
									<ChevronDownIcon className='tiptap-button-dropdown-small' />
								</>
							)}
						</Button>
					}
				/>

				<DropdownMenuContent align='start'>
					<DropdownMenuGroup>
						{levels.map((level) => (
							<DropdownMenuItem
								key={`heading-${level}`}
								nativeButton={true}
								render={
									<HeadingButton
										editor={editor}
										level={level}
										text={`Heading ${level}`}
										showTooltip={false}
										className='!text-foreground [&_.tiptap-button-icon]:!text-foreground [&_.tiptap-button-text]:!text-foreground w-full justify-start'
									/>
								}
							/>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	},
)

HeadingDropdownMenu.displayName = 'HeadingDropdownMenu'

export default HeadingDropdownMenu
