'use client'

import type { Editor } from '@tiptap/react'
import { useCallback } from 'react'

// --- Hooks ---
import { useTiptapEditor } from '#/components/editor/hooks/use-tiptap-editor'
// --- Icons ---
import { ChevronDownIcon } from '#/components/editor/tiptap-icons/chevron-down-icon'
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
// --- Tiptap UI ---
import {
	ListButton,
	type ListType,
} from '#/components/editor/tiptap-ui/list-button'
import { useListDropdownMenu } from '#/components/editor/tiptap-ui/list-dropdown-menu/use-list-dropdown-menu'

export interface ListDropdownMenuProps extends Omit<ButtonProps, 'type'> {
	/**
	 * The Tiptap editor instance.
	 */
	editor?: Editor
	/**
	 * The list types to display in the dropdown.
	 */
	types?: ListType[]
	/**
	 * Whether the dropdown should be hidden when no list types are available
	 * @default false
	 */
	hideWhenUnavailable?: boolean
	/**
	 * Callback for when the dropdown opens or closes
	 */
	onOpenChange?: (isOpen: boolean) => void
	/**
	 * Whether the dropdown should use a modal
	 */
	modal?: boolean
}

export function ListDropdownMenu({
	editor: providedEditor,
	types = ['bulletList', 'orderedList', 'taskList'],
	hideWhenUnavailable = false,
	onOpenChange,
	modal = true,
	...props
}: ListDropdownMenuProps) {
	const { editor } = useTiptapEditor(providedEditor)

	const { filteredLists, canToggle, isActive, isVisible, Icon } =
		useListDropdownMenu({
			editor,
			types,
			hideWhenUnavailable,
		})

	const handleOnOpenChange = useCallback(
		(open: boolean) => {
			onOpenChange?.(open)
		},
		[onOpenChange],
	)

	if (!isVisible) {
		return null
	}

	return (
		<DropdownMenu modal={modal} onOpenChange={handleOnOpenChange}>
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
						aria-label='List options'
						tooltip='List'
						showTooltip={false}
						{...props}
					>
						<Icon className='tiptap-button-icon' />
						<ChevronDownIcon className='tiptap-button-dropdown-small' />
					</Button>
				}
			/>

			<DropdownMenuContent align='start'>
				<DropdownMenuGroup>
					{filteredLists.map((option) => (
						<DropdownMenuItem
							key={option.type}
							nativeButton={true}
							render={
								<ListButton
									editor={editor}
									type={option.type}
									text={option.label}
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
}

export default ListDropdownMenu
