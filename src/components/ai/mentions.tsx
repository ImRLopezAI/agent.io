'use client'

import { useOptionalPromptInputAttachments } from '@ui/ai-elements/prompt-input'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from '@ui/command'
import { Popover, PopoverContent } from '@ui/popover'
import type { LucideIcon } from 'lucide-react'
import {
	BrainCircuit,
	Database,
	Hammer,
	PocketKnife,
	Sparkles,
} from 'lucide-react'
import type * as React from 'react'
import {
	createElement,
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cn } from '#/lib/utils'
// ─── Types ───

export interface MentionOption {
	id: string
	label: string
	description?: string
	/**
	 * Optional per-option icon. When present, the chat UI uses this in
	 * addition to (or instead of) the trigger-level icon — e.g. to show a
	 * `Database` icon next to the `DB Doctor` agent in the collapsible
	 * "agent run" header. Falls back to the trigger config's icon when
	 * undefined.
	 */
	icon?: LucideIcon
	/** Tools owned by this option (only used on agent options) */
	tools?: MentionOption[]
}

export interface MentionConfig {
	trigger: string
	label: string
	options: MentionOption[]
	icon: LucideIcon
	className?: string
}

export interface SelectedMention {
	trigger: string
	option: MentionOption
}

// ─── Default Configs ───

export const AGENTS: MentionOption[] = [
	{
		id: 'db-doctor',
		label: 'DB Doctor',
		description:
			'Query the database and provide database structure, schema description, table description, column description, and other database information.',
		icon: Database,
	},
	{
		id: 'ontology-renderer',
		label: 'Ontology Renderer',
		description:
			'Generate the dynamic UI based on the database structure and schema description.',
		icon: Sparkles,
	},
]

/** Flatten all agent tools into `agentId:toolId` entries for the `#` picker */
function flattenAgentTools(agents: MentionOption[]): MentionOption[] {
	return agents.flatMap((agent) =>
		(agent.tools ?? []).map((tool) => ({
			id: `${agent.id}:${tool.id}`,
			label: `${agent.label}:${tool.label}`,
			description: tool.description,
		})),
	)
}

export const MENTION_CONFIGS: MentionConfig[] = [
	{
		trigger: '@',
		label: 'Agents',
		icon: BrainCircuit,
		className: 'bg-primary/30 ',
		options: AGENTS,
	},
	{
		trigger: '$',
		label: 'Skills',
		className: 'bg-orange-400/30 ',
		icon: PocketKnife,
		options: [],
	},
	{
		trigger: '#',
		label: 'Tools',
		icon: Hammer,
		className: 'bg-blue-400/30 ',
		options: flattenAgentTools(AGENTS)
	},
]

// ─── Badge CSS (injected into contentEditable spans) ───

const BADGE_BASE =
	'inline-flex items-center gap-1 rounded-[4px] px-1 py-[4px] text-xs font-bold align-middle select-none mx-0.5 leading-none h-[1.4em] relative -top-[1px]'

function getConfigForTrigger(trigger: string): MentionConfig | undefined {
	return MENTION_CONFIGS.find((c) => c.trigger === trigger)
}

/** Caret rect for floating-ui virtual anchor (min size so flip/shift behave). */
function getCaretDomRect(editor: HTMLElement): DOMRect {
	const sel = window.getSelection()
	if (!sel?.rangeCount) {
		const r = editor.getBoundingClientRect()
		return new DOMRect(r.x, r.y, Math.max(r.width, 1), Math.max(r.height, 1))
	}
	const range = sel.getRangeAt(0)
	const rects = range.getClientRects()
	if (rects.length > 0) {
		const last = rects.item(rects.length - 1)
		if (last) {
			return new DOMRect(
				last.left,
				last.top,
				Math.max(last.width, 1),
				Math.max(last.height, 1),
			)
		}
	}
	const r = range.getBoundingClientRect()
	return new DOMRect(r.x, r.y, Math.max(r.width, 1), Math.max(r.height, 1))
}

/**
 * Virtual reference for the mentions popover: same horizontal bounds as the
 * composer (form or editor) so width + align match the input bar, with vertical
 * position from the caret. A narrow caret-only rect makes Floating UI align a
 * wide panel to the wrong X and can leave the popup overlapping the field.
 */
function getMentionAnchorRect(editor: HTMLElement): DOMRect {
	const caret = getCaretDomRect(editor)
	const scope = editor.closest('form') ?? editor
	const scopeRect = scope.getBoundingClientRect()
	const bandHeight = Math.max(caret.height, 20)
	return new DOMRect(
		scopeRect.left,
		caret.top,
		Math.max(scopeRect.width, 1),
		bandHeight,
	)
}

function createBadgeElement(
	trigger: string,
	option: MentionOption,
): HTMLSpanElement {
	const config = getConfigForTrigger(trigger)
	const badge = document.createElement('span')
	badge.contentEditable = 'false'
	badge.setAttribute('data-mention-id', option.id)
	badge.setAttribute('data-mention-trigger', trigger)
	badge.setAttribute('data-mention-label', option.label)
	badge.className = `${BADGE_BASE} ${config?.className ?? 'bg-secondary'}`

	if (config?.icon) {
		const iconWrapper = document.createElement('span')
		iconWrapper.className = 'inline-flex size-3.5 shrink-0 opacity-70'
		iconWrapper.innerHTML = renderToStaticMarkup(
			createElement(config.icon, { size: 14 }),
		)
		badge.appendChild(iconWrapper)
	}
	badge.appendChild(document.createTextNode(option.label))

	return badge
}

// ─── Editor Handle ───

export interface MentionEditorHandle {
	/** Extract plain text (badge text excluded) */
	getText: () => string
	/** Extract mentions from the DOM */
	getMentions: () => SelectedMention[]
	/** Clear the editor */
	clear: () => void
	/** Focus the editor */
	focus: () => void
}

// ─── MentionEditor (contentEditable) ───
//
// The editor owns all of its state internally (popover, caret rect,
// placeholder, DOM). Memoizing shields it from parent re-renders during
// AI streaming — its parent (ChatPrompt) receives new `useAi` object
// identities on every streamed chunk, but nothing about MentionEditor's
// own props changes between chunks, so it can skip re-rendering entirely.

const MentionEditorInner = forwardRef<
	MentionEditorHandle,
	{
		placeholder?: string
		className?: string
		configs?: MentionConfig[]
		onTextChange?: (text: string) => void
		/** Gap above the field when opening upward (landing composer often needs more). */
		mentionPopoverSideOffset?: number
	}
>(
	(
		{
			placeholder = 'Type a message...',
			className,
			configs = MENTION_CONFIGS,
			onTextChange,
			mentionPopoverSideOffset = 8,
		},
		ref,
	) => {
		const editorRef = useRef<HTMLDivElement>(null)
		const attachments = useOptionalPromptInputAttachments()

		// ── Popover state ──
		const [popover, setPopover] = useState<{
			config: MentionConfig
			filtered: MentionOption[]
			highlightIndex: number
		} | null>(null)

		const [mentionPopoverWidth, setMentionPopoverWidth] = useState<
			number | undefined
		>(undefined)

		/** Overlay behind the editor — `::before` on contentEditable overlaps the caret. */
		const [showPlaceholder, setShowPlaceholder] = useState(true)

		// VirtualElement: contextElement lets Floating UI autoUpdate subscribe to this
		// node’s scroll/resize so the menu tracks a growing or scrolling contentEditable.
		const caretAnchor = useMemo(
			() => ({
				getBoundingClientRect: () => {
					const el = editorRef.current
					if (!el) return new DOMRect()
					return getMentionAnchorRect(el)
				},
				get contextElement() {
					return editorRef.current ?? undefined
				},
			}),
			[],
		)

		useLayoutEffect(() => {
			if (!popover) {
				setMentionPopoverWidth(undefined)
				return
			}
			const el = editorRef.current
			if (!el) return
			const form = el.closest('form')
			setMentionPopoverWidth((form ?? el).getBoundingClientRect().width)
		}, [popover])

		// ── Extract text with inline mention markers ──
		const getText = useCallback((): string => {
			const el = editorRef.current
			if (!el) return ''
			let text = ''
			for (const node of el.childNodes) {
				if (node.nodeType === Node.TEXT_NODE) {
					text += node.textContent ?? ''
				} else if (node instanceof HTMLElement && node.tagName === 'BR') {
					text += '\n'
				} else if (
					node instanceof HTMLElement &&
					node.hasAttribute('data-mention-id')
				) {
					const trigger = node.getAttribute('data-mention-trigger') ?? '@'
					const label = node.getAttribute('data-mention-label') ?? ''
					text += `\`${trigger}${label}\``
				} else if (node instanceof HTMLElement) {
					text += node.textContent ?? ''
				}
			}
			return text
		}, [])

		// ── Extract mentions ──
		const getMentions = useCallback((): SelectedMention[] => {
			const el = editorRef.current
			if (!el) return []
			return Array.from(
				el.querySelectorAll<HTMLElement>('[data-mention-id]'),
			).map((badge) => ({
				trigger: badge.getAttribute('data-mention-trigger') ?? '@',
				option: {
					id: badge.getAttribute('data-mention-id') ?? '',
					label: badge.getAttribute('data-mention-label') ?? '',
				},
			}))
		}, [])

		/**
		 * contentEditable leaves a `<br>` / stray nodes after deleting the last
		 * character, so `:empty` fails and the placeholder disappears. Collapse to a
		 * real empty div and restore the caret so typing position stays correct.
		 */
		const normalizeBareEditorDom = useCallback(() => {
			const el = editorRef.current
			if (!el) return
			if (getMentions().length > 0) return
			if (getText().replace(/\s/g, '').length > 0) return
			if (el.childNodes.length === 0) return
			el.innerHTML = ''
			if (document.activeElement !== el) return
			const sel = window.getSelection()
			if (!sel) return
			const range = document.createRange()
			range.setStart(el, 0)
			range.collapse(true)
			sel.removeAllRanges()
			sel.addRange(range)
		}, [getMentions, getText])

		// ── Sync text out ───
		const sync = useCallback(() => {
			normalizeBareEditorDom()
			const text = getText()
			onTextChange?.(text)
			setShowPlaceholder(
				getMentions().length === 0 && text.replace(/\s/g, '').length === 0,
			)
		}, [normalizeBareEditorDom, getText, getMentions, onTextChange])

		// ── Clear ──
		const clear = useCallback(() => {
			const el = editorRef.current
			if (el) el.innerHTML = ''
			sync()
		}, [sync])

		// ── Imperative handle ──
		useImperativeHandle(ref, () => ({
			getText,
			getMentions,
			clear,
			focus: () => editorRef.current?.focus(),
		}))

		// ── Detect trigger for popover ──
		const detectTrigger = useCallback(() => {
			const sel = window.getSelection()
			if (!sel?.isCollapsed || !sel.rangeCount) {
				setPopover(null)
				return
			}
			const range = sel.getRangeAt(0)
			let textNode = range.startContainer
			let cursor = range.startOffset

			// If cursor is in an element, find the actual text node
			if (textNode.nodeType !== Node.TEXT_NODE) {
				const child = textNode.childNodes[cursor - 1] ?? textNode.childNodes[0]
				if (child?.nodeType === Node.TEXT_NODE) {
					textNode = child
					cursor = child.textContent?.length ?? 0
				} else {
					setPopover(null)
					return
				}
			}
			const text = textNode.textContent ?? ''

			let wordStart = cursor - 1
			while (
				wordStart >= 0 &&
				text[wordStart] !== ' ' &&
				text[wordStart] !== '\n' &&
				text[wordStart] !== '\u00A0'
			) {
				wordStart--
			}
			wordStart++

			const word = text.slice(wordStart, cursor)
			if (word.length === 0) {
				setPopover(null)
				return
			}

			const config = configs.find((c) => word.startsWith(c.trigger))
			if (!config) {
				setPopover(null)
				return
			}

			const query = word.slice(1).toLowerCase()
			const filtered = query
				? config.options.filter(
						(o) =>
							o.label.toLowerCase().includes(query) ||
							o.id.toLowerCase().includes(query),
					)
				: config.options

			setPopover({ config, filtered, highlightIndex: 0 })
		}, [configs])

		// ── Insert badge at cursor ──
		const insertMention = useCallback(
			(option: MentionOption) => {
				const el = editorRef.current
				if (!el) return
				const sel = window.getSelection()
				if (!sel?.rangeCount) return

				const range = sel.getRangeAt(0)
				let textNode: Node = range.startContainer
				let cursor = range.startOffset

				// If cursor is in an element, find the actual text node
				if (textNode.nodeType !== Node.TEXT_NODE) {
					const child =
						textNode.childNodes[cursor - 1] ?? textNode.childNodes[0]
					if (child?.nodeType === Node.TEXT_NODE) {
						textNode = child
						cursor = child.textContent?.length ?? 0
					} else {
						return
					}
				}

				const text = textNode.textContent ?? ''

				// Find trigger start
				let wordStart = cursor - 1
				while (
					wordStart >= 0 &&
					text[wordStart] !== ' ' &&
					text[wordStart] !== '\n' &&
					text[wordStart] !== '\u00A0'
				) {
					wordStart--
				}
				wordStart++

				const trigger = text[wordStart] ?? '@'
				const before = text.slice(0, wordStart)
				const after = text.slice(cursor)

				// Create badge
				const badge = createBadgeElement(trigger, option)

				// Replace text node with: before + badge + after
				textNode.textContent = before
				const afterNode = document.createTextNode(
					after.length > 0 ? after : ' ',
				)
				const parent = textNode.parentNode
				if (!parent) return

				parent.insertBefore(badge, textNode.nextSibling)
				parent.insertBefore(afterNode, badge.nextSibling)

				// Place cursor after badge
				const newRange = document.createRange()
				newRange.setStart(afterNode, after.length > 0 ? 0 : 1)
				newRange.collapse(true)
				sel.removeAllRanges()
				sel.addRange(newRange)

				setPopover(null)
				sync()
			},
			[sync],
		)

		// ── Handlers ──
		const handleInput = useCallback(() => {
			sync()
			requestAnimationFrame(detectTrigger)
		}, [sync, detectTrigger])

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent<HTMLDivElement>) => {
				// Popover navigation
				if (popover && popover.filtered.length > 0) {
					switch (e.key) {
						case 'ArrowDown':
							e.preventDefault()
							setPopover((s) =>
								s
									? {
											...s,
											highlightIndex: Math.min(
												s.highlightIndex + 1,
												s.filtered.length - 1,
											),
										}
									: s,
							)
							return
						case 'ArrowUp':
							e.preventDefault()
							setPopover((s) =>
								s
									? {
											...s,
											highlightIndex: Math.max(s.highlightIndex - 1, 0),
										}
									: s,
							)
							return
						case 'Tab':
						case 'Enter': {
							const opt = popover.filtered[popover.highlightIndex]
							if (opt) {
								e.preventDefault()
								insertMention(opt)
							}
							return
						}
						case 'Escape':
							e.preventDefault()
							setPopover(null)
							return
					}
				}

				// Enter → submit form
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault()
					editorRef.current?.closest('form')?.requestSubmit()
					return
				}

				// Backspace → delete badge if cursor is right after one
				if (e.key === 'Backspace') {
					const sel = window.getSelection()
					if (!sel?.isCollapsed || !sel.rangeCount) return
					const r = sel.getRangeAt(0)
					const node = r.startContainer
					const offset = r.startOffset

					if (
						node.nodeType === Node.TEXT_NODE &&
						offset === 0 &&
						node.previousSibling instanceof HTMLElement &&
						node.previousSibling.hasAttribute('data-mention-id')
					) {
						e.preventDefault()
						node.previousSibling.remove()
						sync()
						return
					}

					if (
						node === editorRef.current &&
						offset > 0 &&
						node.childNodes[offset - 1] instanceof HTMLElement &&
						(node.childNodes[offset - 1] as HTMLElement).hasAttribute(
							'data-mention-id',
						)
					) {
						e.preventDefault()
						node.childNodes[offset - 1]?.remove()
						sync()
					}
				}
			},
			[popover, insertMention, sync],
		)

		const handlePaste = useCallback(
			(e: React.ClipboardEvent<HTMLDivElement>) => {
				const items = e.clipboardData?.items
				if (items && attachments) {
					const files: File[] = []
					for (const item of items) {
						if (item.kind === 'file') {
							const file = item.getAsFile()
							if (file) {
								files.push(file)
							}
						}
					}
					if (files.length > 0) {
						e.preventDefault()
						attachments.add(files)
						return
					}
				}

				e.preventDefault()
				const text = e.clipboardData.getData('text/plain')
				document.execCommand('insertText', false, text)
				sync()
			},
			[sync, attachments],
		)

		// ── Focus management ──
		useEffect(() => {
			// Auto-detect trigger on focus/click
			const el = editorRef.current
			if (!el) return
			const handleSelectionChange = () => {
				if (document.activeElement === el) {
					detectTrigger()
				}
			}
			document.addEventListener('selectionchange', handleSelectionChange)
			return () =>
				document.removeEventListener('selectionchange', handleSelectionChange)
		}, [detectTrigger])

		return (
			<>
				<Popover
					onOpenChange={(open) => {
						if (!open) setPopover(null)
					}}
					open={!!popover}
				>
					{popover ? (
						<PopoverContent
							align='start'
							anchor={caretAnchor}
							className='gap-0 overflow-hidden p-0'
							collisionAvoidance={{
								side: 'flip',
								align: 'shift',
								fallbackAxisSide: 'none',
							}}
							collisionPadding={16}
							finalFocus={false}
							initialFocus={false}
							side='top'
							sideOffset={mentionPopoverSideOffset}
							style={
								mentionPopoverWidth !== undefined
									? { width: mentionPopoverWidth }
									: undefined
							}
						>
							<MentionPickerList
								onHighlight={(i) =>
									setPopover((s) => (s ? { ...s, highlightIndex: i } : s))
								}
								onSelect={insertMention}
								popover={popover}
							/>
						</PopoverContent>
					) : null}
				</Popover>
				<div className='relative w-full min-w-0 flex-1'>
					{showPlaceholder ? (
						<div
							aria-hidden
							className={cn(
								'pointer-events-none absolute inset-0 z-0 select-none overflow-hidden whitespace-pre-wrap break-words text-left text-muted-foreground',
								className,
							)}
						>
							{placeholder}
						</div>
					) : null}
					<div
						ref={editorRef}
						contentEditable
						tabIndex={0}
						data-slot='input-group-control'
						aria-placeholder={placeholder}
						className={cn(
							'relative z-[1] max-h-48 min-h-[1.5em] w-full overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent text-left text-sm shadow-none outline-none ring-0 focus-visible:ring-0',
							className,
						)}
						onInput={handleInput}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						suppressContentEditableWarning
					/>
				</div>
			</>
		)
	},
)
MentionEditorInner.displayName = 'MentionEditor'

export const MentionEditor = memo(MentionEditorInner)

// ─── Mention picker: cmdk Command inside Popover (filtering stays in the editor) ───

function MentionPickerList({
	popover,
	onHighlight,
	onSelect,
}: {
	popover: {
		config: MentionConfig
		filtered: MentionOption[]
		highlightIndex: number
	}
	onHighlight: (i: number) => void
	onSelect: (option: MentionOption) => void
}) {
	const listRef = useRef<HTMLDivElement>(null)
	const Icon = popover.config.icon
	const selectedId = popover.filtered[popover.highlightIndex]?.id ?? ''

	// Arrow keys are handled on the contentEditable, not cmdk — controlled `value`
	// updates don't run cmdk's internal scroll-into-view (see cmdk `ce()`).
	// Don't scroll via `aria-selected`: cmdk applies that after our layout effect can
	// run, so the list scrolls one row behind. Scroll the row keyed by highlightIndex.
	useLayoutEffect(() => {
		const list = listRef.current
		if (!list) return
		const { highlightIndex, filtered } = popover
		if (highlightIndex < 0 || highlightIndex >= filtered.length) return
		const item = list.querySelector<HTMLElement>(
			`[data-mention-row-index="${String(highlightIndex)}"]`,
		)
		item?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
	}, [popover.highlightIndex, popover.filtered])

	return (
		<Command
			className='max-h-[min(200px,40vh)] rounded-lg bg-transparent p-0'
			label={`${popover.config.label} suggestions`}
			loop={false}
			onValueChange={(id) => {
				const i = popover.filtered.findIndex((o) => o.id === id)
				if (i >= 0 && i !== popover.highlightIndex) {
					onHighlight(i)
				}
			}}
			shouldFilter={false}
			value={selectedId}
			vimBindings={false}
		>
			<CommandList ref={listRef} className='max-h-[min(200px,40vh)]'>
				<CommandGroup>
					{popover.filtered.map((option, rowIndex) => (
						<CommandItem
							key={option.id}
							data-mention-row-index={rowIndex}
							keywords={
								option.description
									? [option.label, option.id, option.description]
									: [option.label, option.id]
							}
							onPointerDown={(e) => {
								e.preventDefault()
							}}
							onSelect={() => {
								onSelect(option)
							}}
							value={option.id}
						>
							<Icon className='size-4 shrink-0 text-muted-foreground' />
							<span className='font-medium'>{option.label}</span>
							{option.description ? (
								<span className='truncate text-muted-foreground text-xs'>
									{option.description}
								</span>
							) : null}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandEmpty className='flex items-center justify-start gap-2 px-2 py-2 text-left text-muted-foreground text-sm'>
					<Icon className='size-4 shrink-0' />
					No {popover.config.label.toLowerCase()} available
				</CommandEmpty>
			</CommandList>
		</Command>
	)
}

// ─── Transform mentions for submission ───

export function transformWithMentions(
	text: string,
	mentions: SelectedMention[],
): string {
	if (mentions.length === 0) return text
	// text already has inline mention markers from getText()
	// Append AI instructions as an HTML comment
	const instructions = mentions
		.map((m) => {
			switch (m.trigger) {
				case '@':
					return `using the ${m.option.id} agent`
				case '$':
					return `use the ${m.option.id} skill`
				case '#': {
					const [agent, tool] = m.option.id.split(':')
					if (agent && tool) {
						return `using the ${agent} ${tool} tool`
					}
					return `use the ${m.option.id} tool`
				}
				default:
					return ''
			}
		})
		.filter(Boolean)
		.join(', ')
	return `${text}\n<!-- ${instructions} -->`
}

/** Mention trigger characters for pattern detection */
export const MENTION_TRIGGERS = new Set(['@', '$', '#'])
