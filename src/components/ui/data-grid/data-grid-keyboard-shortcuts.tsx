'use client'

import { useDirection } from '@base-ui/react/direction-provider'
import {
	formatForDisplay,
	useHotkey,
	useHotkeyRegistrations,
} from '@tanstack/react-hotkeys'
import { Button } from './ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { Kbd, KbdGroup } from './ui/kbd'

interface ShortcutEntry {
	keys: string[]
	description: string
	enabled: boolean
}

interface ShortcutGroup {
	title: string
	shortcuts: ShortcutEntry[]
}

const GROUP_ORDER = [
	'Navigation',
	'Selection',
	'Editing',
	'Clipboard',
	'Search',
	'History',
	'Misc',
] as const

function splitDisplayIntoKeys(display: string): string[] {
	// `formatForDisplay` joins segments with ' + ' on non-mac platforms and
	// concatenates macOS modifier symbols with the key (e.g. '⌘⇧Z'). We split
	// the friendly form and let `<Kbd>` render symbol-only forms verbatim.
	if (display.includes(' + ')) return display.split(' + ')
	return [display]
}

interface DataGridKeyboardShortcutsProps {
	enableSearch?: boolean
	enableUndoRedo?: boolean
	enablePaste?: boolean
	enableRowAdd?: boolean
	enableRowsDelete?: boolean
}

export const DataGridKeyboardShortcuts = React.memo(
	DataGridKeyboardShortcutsImpl,
	(prev, next) => {
		return (
			prev.enableSearch === next.enableSearch &&
			prev.enableUndoRedo === next.enableUndoRedo &&
			prev.enablePaste === next.enablePaste &&
			prev.enableRowAdd === next.enableRowAdd &&
			prev.enableRowsDelete === next.enableRowsDelete
		)
	},
)

function DataGridKeyboardShortcutsImpl(_props: DataGridKeyboardShortcutsProps) {
	const dir = useDirection()
	const [open, setOpen] = React.useState(false)
	const [input, setInput] = React.useState('')
	const inputRef = React.useRef<HTMLInputElement>(null)

	const { hotkeys } = useHotkeyRegistrations()

	const onOpenChange = React.useCallback((isOpen: boolean) => {
		setOpen(isOpen)
		if (!isOpen) {
			setInput('')
		}
	}, [])

	const onInputChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			setInput(event.target.value)
		},
		[],
	)

	useHotkey(
		'Mod+/',
		() => {
			setOpen(true)
		},
		{
			ignoreInputs: true,
			preventDefault: true,
			meta: {
				name: 'Show shortcuts',
				description: 'Show keyboard shortcuts',
				group: 'Misc',
			},
		},
	)

	const shortcutGroups: ShortcutGroup[] = React.useMemo(() => {
		const byGroup = new Map<string, ShortcutEntry[]>()

		for (const reg of hotkeys) {
			const meta = reg.options.meta
			if (!meta?.name) continue

			const groupTitle = meta.group ?? 'Misc'
			const display = formatForDisplay(reg.parsedHotkey)
			const enabled = reg.options.enabled !== false

			const list = byGroup.get(groupTitle) ?? []
			list.push({
				keys: splitDisplayIntoKeys(display),
				description: meta.description ?? meta.name,
				enabled,
			})
			byGroup.set(groupTitle, list)
		}

		const knownTitles = new Set<string>(GROUP_ORDER)
		const orderedKnown = GROUP_ORDER.filter((title) => byGroup.has(title)).map(
			(title) => ({ title, shortcuts: byGroup.get(title) ?? [] }),
		)
		const orderedRest = Array.from(byGroup.keys())
			.filter((title) => !knownTitles.has(title))
			.map((title) => ({ title, shortcuts: byGroup.get(title) ?? [] }))

		return [...orderedKnown, ...orderedRest]
	}, [hotkeys])

	const filteredGroups = React.useMemo(() => {
		if (!input.trim()) return shortcutGroups

		const query = input.toLowerCase()
		return shortcutGroups
			.map((group) => ({
				...group,
				shortcuts: group.shortcuts.filter(
					(shortcut) =>
						shortcut.description.toLowerCase().includes(query) ||
						shortcut.keys.some((key) => key.toLowerCase().includes(query)),
				),
			}))
			.filter((group) => group.shortcuts.length > 0)
	}, [shortcutGroups, input])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				dir={dir}
				className='max-w-2xl px-0'
				initialFocus={inputRef}
				showCloseButton={false}
			>
				<DialogClose
					className='absolute end-6 top-6'
					render={<Button variant='ghost' size='icon' className='size-6' />}
				>
					<XIcon />
				</DialogClose>
				<DialogHeader className='px-6'>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription className='sr-only'>
						Use these keyboard shortcuts to navigate and interact with the data
						grid more efficiently.
					</DialogDescription>
				</DialogHeader>
				<div className='px-6'>
					<div className='relative'>
						<SearchIcon className='absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
						<Input
							ref={inputRef}
							placeholder='Search shortcuts...'
							className='h-8 ps-8'
							value={input}
							onChange={onInputChange}
						/>
					</div>
				</div>
				<Separator className='mx-auto data-[orientation=horizontal]:w-[calc(100%-(--spacing(12)))]' />
				<div className='h-[40vh] overflow-y-auto px-6'>
					{filteredGroups.length === 0 ? (
						<div className='flex h-full flex-col items-center justify-center gap-3 text-center'>
							<div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground'>
								<SearchIcon className='pointer-events-none size-6' />
							</div>
							<div className='flex flex-col gap-1'>
								<div className='font-medium text-lg tracking-tight'>
									No shortcuts found
								</div>
								<p className='text-muted-foreground text-sm'>
									Try searching for a different term.
								</p>
							</div>
						</div>
					) : (
						<div className='flex flex-col gap-6'>
							{filteredGroups.map((shortcutGroup) => (
								<div key={shortcutGroup.title} className='flex flex-col gap-2'>
									<h3 className='font-semibold text-foreground text-sm'>
										{shortcutGroup.title}
									</h3>
									<div className='divide-y divide-border rounded-md border'>
										{shortcutGroup.shortcuts.map((shortcut, index) => (
											<ShortcutCard
												key={index}
												keys={shortcut.keys}
												description={shortcut.description}
												enabled={shortcut.enabled}
											/>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

function ShortcutCard({ keys, description, enabled }: ShortcutEntry) {
	return (
		<div
			className='flex items-center gap-4 px-3 py-2'
			data-enabled={enabled ? 'true' : 'false'}
		>
			<span
				className={
					enabled ? 'flex-1 text-sm' : 'flex-1 text-muted-foreground text-sm'
				}
			>
				{description}
			</span>
			<KbdGroup className='shrink-0'>
				{keys.map((key, index) => (
					<React.Fragment key={key}>
						{index > 0 && (
							<span className='text-muted-foreground text-xs'>+</span>
						)}
						<Kbd>{key}</Kbd>
					</React.Fragment>
				))}
			</KbdGroup>
		</div>
	)
}
