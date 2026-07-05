'use client'

import { useCurrentEditor } from '@tiptap/react'
import { cn } from 'cnfast'
import { useAtom } from 'jotai'
import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'

import { useCursorVisibility } from '#/components/editor/hooks/use-cursor-visibility'
import { useIsBreakpoint } from '#/components/editor/hooks/use-is-breakpoint'
import { useWindowSize } from '#/components/editor/hooks/use-window-size'
import { ArrowLeftIcon } from '#/components/editor/tiptap-icons/arrow-left-icon'
import { BlockquoteIcon } from '#/components/editor/tiptap-icons/blockquote-icon'
import { ChevronDownIcon } from '#/components/editor/tiptap-icons/chevron-down-icon'
import { CodeBlockIcon } from '#/components/editor/tiptap-icons/code-block-icon'
import { Code2Icon } from '#/components/editor/tiptap-icons/code2-icon'
import { HighlighterIcon } from '#/components/editor/tiptap-icons/highlighter-icon'
import { ImagePlusIcon } from '#/components/editor/tiptap-icons/image-plus-icon'
import { LinkIcon } from '#/components/editor/tiptap-icons/link-icon'
import { StrikeIcon } from '#/components/editor/tiptap-icons/strike-icon'
import { SubscriptIcon } from '#/components/editor/tiptap-icons/subscript-icon'
import { SuperscriptIcon } from '#/components/editor/tiptap-icons/superscript-icon'
import { UnderlineIcon } from '#/components/editor/tiptap-icons/underline-icon'
import { Button } from '#/components/editor/tiptap-ui-primitive/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '#/components/editor/tiptap-ui-primitive/dropdown-menu'
import {
	Toolbar,
	ToolbarGroup,
	ToolbarSeparator,
} from '#/components/editor/tiptap-ui-primitive/toolbar'
import { toggleBlockquote } from '#/components/editor/tiptap-ui/blockquote-button/use-blockquote'
import { toggleCodeBlock } from '#/components/editor/tiptap-ui/code-block-button/use-code-block'
import { ColorHighlightPopoverContent } from '#/components/editor/tiptap-ui/color-highlight-popover'
import type { Level } from '#/components/editor/tiptap-ui/heading-button'
import { HeadingDropdownMenu } from '#/components/editor/tiptap-ui/heading-dropdown-menu'
import { insertImage } from '#/components/editor/tiptap-ui/image-upload-button/use-image-upload'
import {
	LinkButton,
	LinkContent,
	LinkPopover,
} from '#/components/editor/tiptap-ui/link-popover'
import type { ListType } from '#/components/editor/tiptap-ui/list-button'
import { ListDropdownMenu } from '#/components/editor/tiptap-ui/list-dropdown-menu'
import { MarkButton } from '#/components/editor/tiptap-ui/mark-button'
import {
	canToggleMark,
	type Mark,
	toggleMark,
} from '#/components/editor/tiptap-ui/mark-button/use-mark'
import { SlashCommandTriggerButton } from '#/components/editor/tiptap-ui/slash-command-trigger-button'
import { TextAlignButton } from '#/components/editor/tiptap-ui/text-align-button'
import { UndoRedoButton } from '#/components/editor/tiptap-ui/undo-redo-button'

import { mobilePanelAtomFamily, type ToolbarMode } from './editor-atoms'
import { useEditorChrome } from './editor-context'
import { isEditorReady } from './editor-utils'

const TOOLBAR_HEADING_LEVELS: Level[] = [1, 2, 3, 4]
const TOOLBAR_LIST_TYPES: ListType[] = ['bulletList', 'orderedList', 'taskList']

function menuItemClass(isActive?: boolean) {
	return cn(
		'flex h-6 w-full items-center justify-start gap-1 rounded px-1.5 text-left font-medium text-[11px] outline-none',
		'data-[highlighted]:bg-muted data-[highlighted]:text-foreground',
		'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		isActive && 'bg-foreground text-background',
	)
}

function MoreMenuItem({
	children,
	disabled,
	icon: Icon,
	isActive,
	onClick,
}: {
	children: ReactNode
	disabled?: boolean
	icon: ComponentType<{ className?: string }>
	isActive?: boolean
	onClick: () => void
}) {
	return (
		<DropdownMenuItem
			className={menuItemClass(isActive)}
			disabled={disabled}
			onClick={onClick}
		>
			<Icon className='size-3.5 shrink-0 opacity-70' />
			<span className='truncate'>{children}</span>
		</DropdownMenuItem>
	)
}

function MoreMarkItem({
	editor,
	icon,
	label,
	type,
}: {
	editor: NonNullable<ReturnType<typeof useCurrentEditor>['editor']>
	icon: ComponentType<{ className?: string }>
	label: string
	type: Mark
}) {
	return (
		<MoreMenuItem
			disabled={!canToggleMark(editor, type)}
			icon={icon}
			isActive={editor.isActive(type)}
			onClick={() => toggleMark(editor, type)}
		>
			{label}
		</MoreMenuItem>
	)
}

function MoreFormattingDropdown({
	editor,
	onHighlighterClick,
}: {
	editor: NonNullable<ReturnType<typeof useCurrentEditor>['editor']>
	onHighlighterClick: () => void
}) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger
				nativeButton
				render={
					<Button
						type='button'
						variant='ghost'
						aria-label='More editor options'
						tooltip='More'
						showTooltip={false}
					>
						<span className='text-[12px]'>More</span>
						<ChevronDownIcon className='tiptap-button-dropdown-small' />
					</Button>
				}
			/>
			<DropdownMenuContent align='end' className='w-36 p-1'>
				<DropdownMenuGroup>
					<DropdownMenuLabel className='px-1.5 pt-1 pb-0.5 text-[10px]'>
						Format
					</DropdownMenuLabel>
					<MoreMarkItem
						editor={editor}
						icon={UnderlineIcon}
						label='Underline'
						type='underline'
					/>
					<MoreMarkItem
						editor={editor}
						icon={StrikeIcon}
						label='Strikethrough'
						type='strike'
					/>
					<MoreMarkItem
						editor={editor}
						icon={Code2Icon}
						label='Inline code'
						type='code'
					/>
					<MoreMenuItem
						disabled={!editor.isEditable}
						icon={BlockquoteIcon}
						isActive={editor.isActive('blockquote')}
						onClick={() => toggleBlockquote(editor)}
					>
						Blockquote
					</MoreMenuItem>
					<MoreMenuItem
						disabled={!editor.isEditable}
						icon={CodeBlockIcon}
						isActive={editor.isActive('codeBlock')}
						onClick={() => toggleCodeBlock(editor)}
					>
						Code block
					</MoreMenuItem>
					<MoreMenuItem
						disabled={!editor.isEditable}
						icon={HighlighterIcon}
						onClick={onHighlighterClick}
					>
						Highlight
					</MoreMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator className='my-0.5' />

				<DropdownMenuGroup>
					<DropdownMenuLabel className='px-1.5 pt-1 pb-0.5 text-[10px]'>
						Script
					</DropdownMenuLabel>
					<MoreMarkItem
						editor={editor}
						icon={SuperscriptIcon}
						label='Superscript'
						type='superscript'
					/>
					<MoreMarkItem
						editor={editor}
						icon={SubscriptIcon}
						label='Subscript'
						type='subscript'
					/>
				</DropdownMenuGroup>

				<DropdownMenuSeparator className='my-0.5' />

				<DropdownMenuGroup>
					<DropdownMenuLabel className='px-1.5 pt-1 pb-0.5 text-[10px]'>
						Insert
					</DropdownMenuLabel>
					<MoreMenuItem
						disabled={!editor.isEditable}
						icon={ImagePlusIcon}
						onClick={() => insertImage(editor)}
					>
						Image
					</MoreMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function MainToolbarContent({
	editor,
	onHighlighterClick,
	onLinkClick,
	isMobile,
}: {
	editor: NonNullable<ReturnType<typeof useCurrentEditor>['editor']>
	onHighlighterClick: () => void
	onLinkClick: () => void
	isMobile: boolean
}) {
	return (
		<>
			<ToolbarGroup>
				<UndoRedoButton editor={editor} action='undo' />
				<UndoRedoButton editor={editor} action='redo' />
			</ToolbarGroup>

			<ToolbarSeparator />

			<ToolbarGroup>
				<HeadingDropdownMenu
					editor={editor}
					modal={false}
					levels={TOOLBAR_HEADING_LEVELS}
				/>
				<ListDropdownMenu
					editor={editor}
					modal={false}
					types={TOOLBAR_LIST_TYPES}
				/>
			</ToolbarGroup>

			<ToolbarSeparator />

			<ToolbarGroup>
				<MarkButton editor={editor} type='bold' />
				<MarkButton editor={editor} type='italic' />
				{!isMobile ? (
					<LinkPopover editor={editor} />
				) : (
					<LinkButton onClick={onLinkClick} />
				)}
			</ToolbarGroup>

			<ToolbarSeparator />

			<ToolbarGroup>
				<TextAlignButton editor={editor} align='left' />
				<TextAlignButton editor={editor} align='center' />
				<TextAlignButton editor={editor} align='right' />
				<TextAlignButton editor={editor} align='justify' />
			</ToolbarGroup>

			<ToolbarSeparator />

			<ToolbarGroup>
				<SlashCommandTriggerButton
					editor={editor}
					trigger='/'
					hideWhenUnavailable
					registerHotkey={false}
				/>
				<MoreFormattingDropdown
					editor={editor}
					onHighlighterClick={onHighlighterClick}
				/>
			</ToolbarGroup>
		</>
	)
}

function MobileToolbarContent({
	type,
	onBack,
}: {
	type: 'highlighter' | 'link'
	onBack: () => void
}) {
	return (
		<>
			<ToolbarGroup>
				<Button variant='ghost' onClick={onBack}>
					<ArrowLeftIcon className='tiptap-button-icon' />
					{type === 'highlighter' ? (
						<HighlighterIcon className='tiptap-button-icon' />
					) : (
						<LinkIcon className='tiptap-button-icon' />
					)}
				</Button>
			</ToolbarGroup>

			<ToolbarSeparator />

			{type === 'highlighter' ? (
				<ColorHighlightPopoverContent />
			) : (
				<LinkContent />
			)}
		</>
	)
}

function toolbarVisibilityClass(toolbarMode: ToolbarMode) {
	if (toolbarMode === 'never') return 'hidden'
	if (toolbarMode === 'focus') {
		return 'hidden group-focus-within/editor:block'
	}
	return 'block'
}

export function EditorToolbar({
	variant = 'composer',
}: {
	variant?: 'composer' | 'document'
}) {
	const { editor } = useCurrentEditor()
	const { instanceId, toolbarMode } = useEditorChrome()
	const [mobilePanel, setMobilePanel] = useAtom(
		mobilePanelAtomFamily(instanceId),
	)
	const isMobile = useIsBreakpoint()
	const { height } = useWindowSize()
	const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null)

	const rect = useCursorVisibility({
		editor: isEditorReady(editor) ? editor : null,
		overlayHeight: toolbarNode?.getBoundingClientRect().height ?? 0,
	})

	if (!isEditorReady(editor)) return null

	return (
		<div
			className={cn(
				toolbarVisibilityClass(toolbarMode),
				'mb-2 max-w-full overflow-x-auto overscroll-x-contain border-none',
			)}
		>
			<Toolbar
				ref={setToolbarNode}
				variant='floating'
				className={cn(
					'w-max min-w-full border-none bg-transparent text-foreground shadow-sm',
					variant === 'document' ? 'rounded-lg' : 'rounded-md',
				)}
				style={
					isMobile
						? {
								bottom: `calc(100% - ${height - rect.y}px)`,
							}
						: {}
				}
				onPointerDown={(event) => {
					const target = event.target
					if (
						target instanceof Element &&
						(target.closest('[data-slot="tiptap-dropdown-menu-trigger"]') ||
							target.closest('[data-slot="tiptap-popover-trigger"]'))
					) {
						return
					}

					event.preventDefault()
				}}
			>
				{!isMobile || mobilePanel === 'main' ? (
					<MainToolbarContent
						editor={editor}
						onHighlighterClick={() => setMobilePanel('highlighter')}
						onLinkClick={() => setMobilePanel('link')}
						isMobile={isMobile}
					/>
				) : (
					<MobileToolbarContent
						type={mobilePanel === 'highlighter' ? 'highlighter' : 'link'}
						onBack={() => setMobilePanel('main')}
					/>
				)}
			</Toolbar>
		</div>
	)
}
