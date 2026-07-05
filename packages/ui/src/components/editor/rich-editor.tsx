'use client'

import './editor.css'
import {
	type UseHotkeyDefinition,
	useHotkey,
	useHotkeys,
} from '@tanstack/react-hotkeys'
import { useDebouncedCallback } from '@tanstack/react-pacer'
import { TextSelection } from '@tiptap/pm/state'
import {
	type Editor,
	EditorContent,
	EditorContext,
	useEditor,
} from '@tiptap/react'
import { cn } from 'cnfast'
import { useSetAtom } from 'jotai'
import { type RefObject, useId, useMemo, useRef } from 'react'

import { toggleBlockquote } from '#/components/editor/tiptap-ui/blockquote-button/use-blockquote'
import { toggleCodeBlock } from '#/components/editor/tiptap-ui/code-block-button/use-code-block'
import { toggleHeading } from '#/components/editor/tiptap-ui/heading-button/use-heading'
import { insertImage } from '#/components/editor/tiptap-ui/image-upload-button/use-image-upload'
import { toggleList } from '#/components/editor/tiptap-ui/list-button/use-list'
import { toggleMark } from '#/components/editor/tiptap-ui/mark-button/use-mark'
import { useSlashCommandTrigger } from '#/components/editor/tiptap-ui/slash-command-trigger-button'
import { setTextAlign } from '#/components/editor/tiptap-ui/text-align-button/use-text-align'

import { normalizeDescriptionMarkdown } from './document'
import {
	mentionContextAtomFamily,
	slashContextAtomFamily,
	type ToolbarMode,
} from './editor-atoms'
import { EditorBubbleMenu } from './editor-bubble-menu'
import { EditorProvider } from './editor-context'
import { EditorDragHandle } from './editor-drag-handle'
import { EditorFloatingMenu } from './editor-floating-menu'
import { EditorMentionMenu } from './editor-mention-menu'
import { EditorSlashMenu } from './editor-slash-menu'
import { EditorToolbar } from './editor-toolbar'
import { EditorTransactionSync } from './editor-transaction-sync'
import { isEditorReady } from './editor-utils'
import { createEditorExtensions } from './extensions'
import type { EditorMember } from './types'

type EditorHotkeyAction = {
	hotkey: string
	name: string
	description: string
	preventDefault?: boolean
	run: (event: KeyboardEvent) => void
}

type RichEditorProps = {
	content?: string
	onChange?: (markdown: string) => void
	onModEnter?: (markdown: string) => void
	changeDebounceMs?: number
	placeholder?: string
	className?: string
	editorClassName?: string
	toolbarMode?: ToolbarMode
	variant?: 'composer' | 'document'
	minimal?: boolean
	members?: EditorMember[]
	resetKey?: string | number
}

const editorGeneratedContentClassName = [
	'selection:bg-primary/15',
	'[&_.ProseMirror]:whitespace-pre-wrap',
	'[&_.ProseMirror]:break-words',
	'[&_.ProseMirror]:outline-none',
	'[&_.ProseMirror]:caret-primary',
	'[&_.ProseMirror-selectednode]:rounded-sm',
	'[&_.ProseMirror-selectednode]:bg-primary/10',
	'[&_.selection]:bg-primary/10',
	'[&_.is-empty]:before:pointer-events-none',
	'[&_.is-empty]:before:float-left',
	'[&_.is-empty]:before:h-0',
	'[&_.is-empty]:before:text-muted-foreground/75',
	'[&_.is-empty]:before:content-[attr(data-placeholder)]',
	'[&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
	'[&_.with-slash]:after:pointer-events-none',
	'[&_.with-slash]:after:ml-1',
	'[&_.with-slash]:after:text-muted-foreground/55',
	"[&_.with-slash]:after:content-['Type_/_for_commands']",
	'[&_p]:relative',
	'[&_p]:text-base',
	'[&_p]:leading-[1.6]',
	'[&_p]:text-foreground',
	'[&_p+*]:mt-5',
	'[&_a]:cursor-pointer',
	'[&_a]:text-primary',
	'[&_a]:underline',
	'[&_a]:underline-offset-2',
	'[&_mark]:rounded-sm',
	'[&_mark]:px-0.5',
	'[&_code]:rounded-md',
	'[&_code]:border',
	'[&_code]:border-border',
	'[&_code]:bg-muted',
	'[&_code]:px-1.5',
	'[&_code]:py-0.5',
	'[&_code]:font-mono',
	'[&_code]:text-[0.875em]',
	'[&_code]:text-muted-foreground',
	'[&_pre]:my-6',
	'[&_pre]:overflow-x-auto',
	'[&_pre]:rounded-md',
	'[&_pre]:border',
	'[&_pre]:border-border',
	'[&_pre]:bg-muted',
	'[&_pre]:p-4',
	'[&_pre]:font-mono',
	'[&_pre]:text-sm',
	'[&_pre]:text-foreground',
	'[&_pre_code]:border-0',
	'[&_pre_code]:bg-transparent',
	'[&_pre_code]:p-0',
	'[&_pre_code]:text-inherit',
	'[&_blockquote]:relative',
	'[&_blockquote]:my-6',
	'[&_blockquote]:border-l-4',
	'[&_blockquote]:border-foreground',
	'[&_blockquote]:py-1.5',
	'[&_blockquote]:pl-4',
	'[&_blockquote]:text-muted-foreground',
	'[&_blockquote_p]:mt-0',
	'[&_h1]:relative',
	'[&_h1]:mt-[3em]',
	'[&_h1]:text-[1.5em]',
	'[&_h1]:font-bold',
	'[&_h1]:leading-tight',
	'[&_h2]:relative',
	'[&_h2]:mt-[2.5em]',
	'[&_h2]:text-[1.25em]',
	'[&_h2]:font-bold',
	'[&_h2]:leading-tight',
	'[&_h3]:relative',
	'[&_h3]:mt-[2em]',
	'[&_h3]:text-[1.125em]',
	'[&_h3]:font-semibold',
	'[&_h3]:leading-snug',
	'[&_h4]:relative',
	'[&_h4]:mt-[2em]',
	'[&_h4]:text-[1em]',
	'[&_h4]:font-semibold',
	'[&_h4]:leading-snug',
	'[&>h1:first-child]:mt-0',
	'[&>h2:first-child]:mt-0',
	'[&>h3:first-child]:mt-0',
	'[&>h4:first-child]:mt-0',
	'[&_ul]:my-6',
	'[&_ol]:my-6',
	'[&_ul]:list-outside',
	'[&_ol]:list-outside',
	'[&_ul]:pl-6',
	'[&_ol]:pl-6',
	'[&_ul]:list-disc',
	'[&_ol]:list-decimal',
	'[&_ul_ul]:list-[circle]',
	'[&_ul_ul_ul]:list-[square]',
	'[&_ol_ol]:list-[lower-alpha]',
	'[&_ol_ol_ol]:list-[lower-roman]',
	'[&_li]:my-1.5',
	'[&_li_p]:mt-0',
	'[&_ul[data-type=taskList]]:list-none',
	'[&_ul[data-type=taskList]]:pl-1',
	'[&_ul[data-type=taskList]_li]:flex',
	'[&_ul[data-type=taskList]_li]:items-start',
	'[&_ul[data-type=taskList]_li]:gap-2',
	'[&_ul[data-type=taskList]_label]:mt-1',
	'[&_ul[data-type=taskList]_label]:inline-flex',
	'[&_ul[data-type=taskList]_label]:size-4',
	'[&_ul[data-type=taskList]_label]:shrink-0',
	'[&_ul[data-type=taskList]_input[type=checkbox]]:size-4',
	'[&_ul[data-type=taskList]_input[type=checkbox]]:accent-primary',
	'[&_[data-type=horizontalRule]]:my-[2.25em]',
	'[&_[data-type=horizontalRule]]:py-3',
	'[&_[data-type=horizontalRule]_hr]:h-px',
	'[&_[data-type=horizontalRule]_hr]:border-0',
	'[&_[data-type=horizontalRule]_hr]:bg-border',
	'[&_img]:h-auto',
	'[&_img]:max-w-full',
	'[&_img]:rounded-sm',
	'[&_img]:outline',
	'[&_img]:outline-2',
	'[&_img]:outline-transparent',
	'[&_.ProseMirror-selectednode_img]:outline-ring',
	'[&_table]:my-5',
	'[&_table]:w-full',
	'[&_table]:table-fixed',
	'[&_table]:border-collapse',
	'[&_table]:overflow-hidden',
	'[&_td]:border',
	'[&_td]:border-border',
	'[&_td]:px-3',
	'[&_td]:py-2.5',
	'[&_td]:align-top',
	'[&_th]:border',
	'[&_th]:border-border',
	'[&_th]:bg-muted',
	'[&_th]:px-3',
	'[&_th]:py-2.5',
	'[&_th]:text-left',
	'[&_th]:font-semibold',
	'[&_.selectedCell]:relative',
	'[&_.selectedCell]:after:pointer-events-none',
	'[&_.selectedCell]:after:absolute',
	'[&_.selectedCell]:after:inset-0',
	'[&_.selectedCell]:after:bg-primary/10',
	'[&_.selectedCell]:after:content-[""]',
	'[&_details]:my-4',
	'[&_details]:overflow-hidden',
	'[&_details]:rounded-md',
	'[&_details]:border',
	'[&_details]:border-border',
	'[&_summary]:flex',
	'[&_summary]:cursor-pointer',
	'[&_summary]:select-none',
	'[&_summary]:items-center',
	'[&_summary]:gap-2',
	'[&_summary]:px-4',
	'[&_summary]:py-3',
	'[&_summary]:font-medium',
	'[&_summary]:text-foreground',
	'[&_summary]:marker:hidden',
	'[&_summary]:before:text-xs',
	'[&_summary]:before:text-muted-foreground',
	'[&_summary]:before:transition-transform',
	"[&_summary]:before:content-['>']",
	'[&_details[open]>summary]:before:rotate-90',
	'[&_[data-type=detailsContent]]:border-t',
	'[&_[data-type=detailsContent]]:border-border',
	'[&_[data-type=detailsContent]]:p-4',
	'[&_div[data-youtube-video]]:my-5',
	'[&_div[data-twitch-video]]:my-5',
	'[&_div[data-audio]]:my-5',
	'[&_div[data-youtube-video]]:overflow-hidden',
	'[&_div[data-twitch-video]]:overflow-hidden',
	'[&_div[data-audio]]:overflow-hidden',
	'[&_div[data-youtube-video]]:rounded-lg',
	'[&_div[data-twitch-video]]:rounded-lg',
	'[&_div[data-audio]]:rounded-lg',
	'[&_div[data-youtube-video]]:border',
	'[&_div[data-twitch-video]]:border',
	'[&_div[data-audio]]:border',
	'[&_div[data-youtube-video]]:border-border',
	'[&_div[data-twitch-video]]:border-border',
	'[&_div[data-audio]]:border-border',
	'[&_iframe]:aspect-video',
	'[&_iframe]:w-full',
	'[&_iframe]:border-0',
	'[&_audio]:w-full',
].join(' ')

export function RichEditor({
	content = '',
	onChange,
	onModEnter,
	changeDebounceMs = 300,
	placeholder = 'Write a description...',
	className,
	editorClassName,
	toolbarMode = 'always',
	variant = 'composer',
	minimal = false,
	members: membersProp,
	resetKey,
}: RichEditorProps) {
	const instanceId = useId()

	return (
		<EditorProvider instanceId={instanceId} toolbarMode={toolbarMode}>
			<RichEditorSurface
				key={resetKey}
				instanceId={instanceId}
				content={content}
				onChange={onChange}
				onModEnter={onModEnter}
				changeDebounceMs={changeDebounceMs}
				placeholder={placeholder}
				className={className}
				editorClassName={editorClassName}
				variant={variant}
				minimal={minimal}
				members={membersProp}
			/>
		</EditorProvider>
	)
}

function EditorMenus({
	minimal,
	variant,
	floating = false,
}: {
	minimal: boolean
	variant: 'composer' | 'document'
	floating?: boolean
}) {
	return (
		<EditorTransactionSync>
			{minimal ? null : (
				<>
					<EditorToolbar variant={variant} />
					<EditorDragHandle />
					{floating && <EditorFloatingMenu />}
				</>
			)}
			<EditorBubbleMenu />
			<EditorMentionMenu />
			<EditorSlashMenu />
		</EditorTransactionSync>
	)
}

function RichEditorSurface({
	instanceId,
	content = '',
	onChange,
	onModEnter,
	changeDebounceMs = 300,
	placeholder = 'Write a description...',
	className,
	editorClassName,
	variant = 'composer',
	minimal = false,
	members: membersProp,
}: Omit<RichEditorProps, 'resetKey' | 'toolbarMode'> & {
	instanceId: string
}) {
	if (membersProp === undefined) {
		return (
			<RichEditorSurfaceWithActions
				instanceId={instanceId}
				content={content}
				onChange={onChange}
				onModEnter={onModEnter}
				changeDebounceMs={changeDebounceMs}
				placeholder={placeholder}
				className={className}
				editorClassName={editorClassName}
				variant={variant}
				minimal={minimal}
			/>
		)
	}

	return (
		<RichEditorSurfaceInner
			instanceId={instanceId}
			content={content}
			onChange={onChange}
			onModEnter={onModEnter}
			changeDebounceMs={changeDebounceMs}
			placeholder={placeholder}
			className={className}
			editorClassName={editorClassName}
			variant={variant}
			minimal={minimal}
			members={membersProp}
		/>
	)
}

function RichEditorSurfaceWithActions(
	props: Omit<RichEditorProps, 'resetKey' | 'toolbarMode' | 'members'> & {
		instanceId: string
	},
) {
	return <RichEditorSurfaceInner {...props} members={[]} />
}

function RichEditorSurfaceInner({
	instanceId,
	content = '',
	onChange,
	onModEnter,
	changeDebounceMs = 300,
	placeholder = 'Write a description...',
	className,
	editorClassName,
	variant = 'composer',
	minimal = false,
	members,
}: Omit<RichEditorProps, 'resetKey' | 'toolbarMode'> & {
	instanceId: string
	members: EditorMember[]
}) {
	const membersRef = useRef(members)
	membersRef.current = members
	const editorRootRef = useRef<HTMLDivElement>(null)

	const setMentionContext = useSetAtom(mentionContextAtomFamily(instanceId))
	const setSlashContext = useSetAtom(slashContextAtomFamily(instanceId))

	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange
	const onModEnterRef = useRef(onModEnter)
	onModEnterRef.current = onModEnter

	const debouncedOnChange = useDebouncedCallback(
		(markdown: string) => {
			onChangeRef.current?.(markdown)
		},
		{ wait: changeDebounceMs },
	)

	const suggestionCallbacksRef = useRef({
		setMentionContext,
		setSlashContext,
	})
	suggestionCallbacksRef.current = {
		setMentionContext,
		setSlashContext,
	}

	const markdownContent = useMemo(
		() => normalizeDescriptionMarkdown(content),
		[content],
	)
	const initialContentRef = useRef<string | null>(null)
	if (initialContentRef.current === null) {
		initialContentRef.current = markdownContent
	}

	const extensions = useMemo(
		() =>
			createEditorExtensions({
				placeholder,
				getMembers: () => membersRef.current,
				variant,
				onMentionContextChange: (context) => {
					queueMicrotask(() =>
						suggestionCallbacksRef.current.setMentionContext(context),
					)
				},
				onSlashContextChange: (context) => {
					queueMicrotask(() =>
						suggestionCallbacksRef.current.setSlashContext(context),
					)
				},
				showSlashPlaceholder: !minimal,
			}),
		[placeholder, variant, minimal],
	)

	const editor = useEditor({
		immediatelyRender: false,
		shouldRerenderOnTransaction: false,
		contentType: 'markdown',
		editorProps: {
			attributes: {
				autocomplete: 'off',
				autocorrect: 'off',
				autocapitalize: 'off',
				'aria-label': placeholder,
				class: cn(
					'tiptap min-h-[124px] text-[15px] text-foreground leading-6 outline-none',
					editorGeneratedContentClassName,
					variant === 'document' ? 'px-0 py-0' : 'px-0 py-2',
					minimal && 'min-h-[82px] py-0 text-sm leading-5',
					editorClassName,
				),
			},
		},
		extensions,
		content: initialContentRef.current,
		onUpdate: ({ editor: activeEditor }) => {
			if (!onChangeRef.current) return
			if (changeDebounceMs === 0) {
				onChangeRef.current(activeEditor.getMarkdown())
				return
			}
			debouncedOnChange(activeEditor.getMarkdown())
		},
	})

	const editorReady = isEditorReady(editor)

	const submitFocusedEditor = () => {
		if (!editorReady) return
		if (!onModEnterRef.current) return
		if (!editorRootRef.current?.contains(document.activeElement)) return
		onModEnterRef.current(editor.getMarkdown())
	}

	useHotkey('Mod+Enter', submitFocusedEditor, {
		enabled: Boolean(onModEnter),
		ignoreInputs: false,
		preventDefault: true,
		conflictBehavior: 'allow',
		meta: {
			name: 'Submit editor content',
			description: 'Submit the focused editor content',
		},
	})

	useSlashCommandTrigger({
		editor,
		trigger: '/',
		hotkeyTargetRef: editorRootRef,
	})

	return (
		<EditorContext.Provider value={{ editor }}>
			<div
				ref={editorRootRef}
				className={cn(
					'group/editor editor--with-drag-handle relative min-w-0',
					variant === 'composer' &&
						'rounded-lg border border-border bg-background focus-within:border-border focus-within:ring-0',
					className,
				)}
			>
				{editorReady ? (
					<>
						<EditorKeyboardShortcuts
							editor={editor}
							editorRootRef={editorRootRef}
						/>
						<EditorMenus minimal={minimal} variant={variant} />
					</>
				) : null}
				<EditorContent
					editor={editor}
					role='presentation'
					className={cn(
						variant === 'document' ? 'px-0' : 'px-3',
						minimal && 'px-0',
					)}
				/>
			</div>
		</EditorContext.Provider>
	)
}

function preventAndRun(event: KeyboardEvent, action: () => void) {
	event.preventDefault()
	event.stopPropagation()
	action()
}

function runIfNativeDidNotHandle(event: KeyboardEvent, action: () => void) {
	if (event.defaultPrevented) return
	preventAndRun(event, action)
}

function setRegularText(editor: Editor) {
	editor.chain().focus().setParagraph().run()
}

function setCollapsibleSection(editor: Editor) {
	if (editor.isActive('details')) {
		editor.chain().focus().unsetDetails().run()
		return
	}
	editor.chain().focus().setDetails().run()
}

function setEditorLink(editor: Editor) {
	const previousHref = editor.getAttributes('link').href as string | undefined
	const href = window.prompt('Paste or type a link', previousHref ?? '')
	if (href === null) return

	const nextHref = href.trim()
	if (!nextHref) {
		editor.chain().focus().extendMarkRange('link').unsetLink().run()
		return
	}

	editor
		.chain()
		.focus()
		.extendMarkRange('link')
		.setLink({ href: nextHref })
		.run()
}

function toggleHighlight(editor: Editor) {
	editor.chain().focus().toggleHighlight().run()
}

function moveSelection(editor: Editor, direction: 'up' | 'down') {
	const { state, view } = editor
	const resolved =
		direction === 'up' ? state.selection.$from : state.selection.$to
	const currentBlockStart = resolved.start()
	const target =
		direction === 'up'
			? Math.max(0, currentBlockStart - 2)
			: Math.min(state.doc.content.size, resolved.end() + 2)

	view.focus()
	view.dispatch(
		state.tr.setSelection(TextSelection.near(state.doc.resolve(target))),
	)
}

function EditorKeyboardShortcuts({
	editor,
	editorRootRef,
}: {
	editor: Editor
	editorRootRef: RefObject<HTMLDivElement | null>
}) {
	const actions = useMemo<EditorHotkeyAction[]>(
		() => [
			{
				hotkey: 'Mod+B',
				name: 'Bold',
				description: 'Toggle bold text',
				preventDefault: false,
				run: (event) =>
					runIfNativeDidNotHandle(event, () => toggleMark(editor, 'bold')),
			},
			{
				hotkey: 'Mod+I',
				name: 'Italic',
				description: 'Toggle italic text',
				preventDefault: false,
				run: (event) =>
					runIfNativeDidNotHandle(event, () => toggleMark(editor, 'italic')),
			},
			{
				hotkey: 'Mod+U',
				name: 'Underline',
				description: 'Toggle underline text',
				preventDefault: false,
				run: (event) =>
					runIfNativeDidNotHandle(event, () => toggleMark(editor, 'underline')),
			},
			{
				hotkey: 'Mod+S',
				name: 'Strikethrough',
				description: 'Toggle strikethrough text',
				run: (event) =>
					preventAndRun(event, () => toggleMark(editor, 'strike')),
			},
			{
				hotkey: 'Mod+Shift+U',
				name: 'Attach image/file',
				description: 'Attach an image or file',
				run: (event) => preventAndRun(event, () => insertImage(editor)),
			},
			{
				hotkey: 'Mod+E',
				name: 'Inline code',
				description: 'Toggle inline code text',
				run: (event) => preventAndRun(event, () => toggleMark(editor, 'code')),
			},
			{
				hotkey: 'Mod+.',
				name: 'Superscript',
				description: 'Toggle superscript text',
				run: (event) =>
					preventAndRun(event, () => toggleMark(editor, 'superscript')),
			},
			{
				hotkey: 'Mod+,',
				name: 'Subscript',
				description: 'Toggle subscript text',
				run: (event) =>
					preventAndRun(event, () => toggleMark(editor, 'subscript')),
			},
			{
				hotkey: 'Mod+K',
				name: 'Turn text into link',
				description: 'Create or edit a link',
				run: (event) => preventAndRun(event, () => setEditorLink(editor)),
			},
			{
				hotkey: 'Alt+Shift+.',
				name: 'Blockquote',
				description: 'Toggle blockquote',
				run: (event) => preventAndRun(event, () => toggleBlockquote(editor)),
			},
			{
				hotkey: 'Mod+Alt+0',
				name: 'Regular text',
				description: 'Turn selection into regular text',
				preventDefault: false,
				run: (event) =>
					runIfNativeDidNotHandle(event, () => setRegularText(editor)),
			},
			...[1, 2, 3, 4].map((level) => ({
				hotkey: `Mod+Alt+${level}`,
				name: `Heading ${level}`,
				description: `Turn selection into heading ${level}`,
				preventDefault: false,
				run: (event: KeyboardEvent) =>
					runIfNativeDidNotHandle(event, () =>
						toggleHeading(editor, level as 1 | 2 | 3 | 4),
					),
			})),
			{
				hotkey: 'Mod+Shift+6',
				name: 'Collapsible section',
				description: 'Toggle a collapsible section',
				run: (event) =>
					preventAndRun(event, () => setCollapsibleSection(editor)),
			},
			{
				hotkey: 'Mod+Shift+7',
				name: 'Checklist',
				description: 'Toggle checklist',
				run: (event) =>
					preventAndRun(event, () => toggleList(editor, 'taskList')),
			},
			{
				hotkey: 'Mod+Shift+8',
				name: 'Bulleted list',
				description: 'Toggle bulleted list',
				run: (event) =>
					preventAndRun(event, () => toggleList(editor, 'bulletList')),
			},
			{
				hotkey: 'Mod+Shift+9',
				name: 'Numbered list',
				description: 'Toggle numbered list',
				run: (event) =>
					preventAndRun(event, () => toggleList(editor, 'orderedList')),
			},
			{
				hotkey: 'Mod+Shift+\\',
				name: 'Code block',
				description: 'Toggle code block',
				run: (event) => preventAndRun(event, () => toggleCodeBlock(editor)),
			},
			{
				hotkey: 'Mod+Shift+H',
				name: 'Highlight',
				description: 'Toggle highlighted text',
				run: (event) => preventAndRun(event, () => toggleHighlight(editor)),
			},
			{
				hotkey: 'Alt+Tab',
				name: 'Indent list item',
				description: 'Indent the current list item',
				run: (event) =>
					preventAndRun(event, () => {
						if (editor.isActive('taskItem')) {
							editor.chain().focus().sinkListItem('taskItem').run()
							return
						}
						editor.chain().focus().sinkListItem('listItem').run()
					}),
			},
			{
				hotkey: 'Alt+Shift+Tab',
				name: 'Outdent list item',
				description: 'Outdent the current list item',
				run: (event) =>
					preventAndRun(event, () => {
						if (editor.isActive('taskItem')) {
							editor.chain().focus().liftListItem('taskItem').run()
							return
						}
						editor.chain().focus().liftListItem('listItem').run()
					}),
			},
			{
				hotkey: 'Mod+Shift+L',
				name: 'Align left',
				description: 'Align text left',
				run: (event) =>
					preventAndRun(event, () => setTextAlign(editor, 'left')),
			},
			{
				hotkey: 'Mod+Shift+E',
				name: 'Align center',
				description: 'Align text center',
				run: (event) =>
					preventAndRun(event, () => setTextAlign(editor, 'center')),
			},
			{
				hotkey: 'Mod+Shift+R',
				name: 'Align right',
				description: 'Align text right',
				run: (event) =>
					preventAndRun(event, () => setTextAlign(editor, 'right')),
			},
			{
				hotkey: 'Mod+Shift+J',
				name: 'Align justify',
				description: 'Justify text',
				run: (event) =>
					preventAndRun(event, () => setTextAlign(editor, 'justify')),
			},
			{
				hotkey: 'Alt+ArrowUp',
				name: 'Move selection up',
				description: 'Move the cursor to the block above',
				run: (event) => preventAndRun(event, () => moveSelection(editor, 'up')),
			},
			{
				hotkey: 'Alt+ArrowDown',
				name: 'Move selection down',
				description: 'Move the cursor to the block below',
				run: (event) =>
					preventAndRun(event, () => moveSelection(editor, 'down')),
			},
		],
		[editor],
	)

	useHotkeys(
		actions.map((action) => ({
			hotkey: action.hotkey,
			callback: (event) => action.run(event),
			options: {
				preventDefault: action.preventDefault ?? true,
				stopPropagation: false,
				meta: {
					name: action.name,
					description: action.description,
					group: 'Editing',
				},
			},
		})) as UseHotkeyDefinition[],
		{
			target: editorRootRef,
			ignoreInputs: false,
			conflictBehavior: 'allow',
		},
	)

	return null
}
