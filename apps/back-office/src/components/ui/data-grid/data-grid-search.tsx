'use client'

import { useHotkey } from '@tanstack/react-hotkeys'
import { cn } from 'cnfast'
import {
	ArrowDown,
	ArrowUp,
	CaseSensitive,
	ChevronDown,
	Replace,
	ReplaceAll,
	TextSelect,
	WholeWord,
	X,
} from 'lucide-react'
import * as React from 'react'

import { useAsRef } from './hooks/use-as-ref'
import { useDebouncedCallback } from './hooks/use-debounced-callback'
import type { SearchState } from './types/data-grid'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface DataGridSearchProps extends SearchState {}

export const DataGridSearch = React.memo(DataGridSearchImpl, (prev, next) => {
	if (prev.searchOpen !== next.searchOpen) return false

	if (!next.searchOpen) return true

	if (
		prev.searchQuery !== next.searchQuery ||
		prev.replaceQuery !== next.replaceQuery ||
		prev.matchIndex !== next.matchIndex
	) {
		return false
	}

	if (prev.replaceEnabled !== next.replaceEnabled) return false
	if (prev.searchCaseSensitive !== next.searchCaseSensitive) return false
	if (prev.searchWholeWord !== next.searchWholeWord) return false
	if (prev.searchRegex !== next.searchRegex) return false
	if (prev.searchRegexError !== next.searchRegexError) return false
	if (prev.searchInSelection !== next.searchInSelection) return false

	if (prev.searchMatches.length !== next.searchMatches.length) return false

	for (let i = 0; i < prev.searchMatches.length; i++) {
		const prevMatch = prev.searchMatches[i]
		const nextMatch = next.searchMatches[i]

		if (!prevMatch || !nextMatch) return false

		if (
			prevMatch.rowIndex !== nextMatch.rowIndex ||
			prevMatch.columnId !== nextMatch.columnId
		) {
			return false
		}
	}

	return true
})

function DataGridSearchImpl({
	searchMatches,
	matchIndex,
	searchOpen,
	onSearchOpenChange,
	searchQuery,
	onSearchQueryChange,
	onSearch,
	replaceQuery,
	onReplaceQueryChange,
	onReplaceNext,
	onReplaceAll,
	replaceEnabled,
	searchCaseSensitive,
	searchWholeWord,
	searchRegex,
	searchRegexError,
	searchInSelection,
	onSearchCaseSensitiveChange,
	onSearchWholeWordChange,
	onSearchRegexChange,
	onSearchInSelectionChange,
	onNavigateToNextMatch,
	onNavigateToPrevMatch,
}: DataGridSearchProps) {
	const propsRef = useAsRef({
		onSearchOpenChange,
		onSearchQueryChange,
		onSearch,
		onReplaceQueryChange,
		onReplaceNext,
		onReplaceAll,
		onSearchCaseSensitiveChange,
		onSearchWholeWordChange,
		onSearchRegexChange,
		onSearchInSelectionChange,
		onNavigateToNextMatch,
		onNavigateToPrevMatch,
	})

	const inputRef = React.useRef<HTMLInputElement>(null)
	const [showReplace, setShowReplace] = React.useState(false)

	React.useEffect(() => {
		if (searchOpen) {
			requestAnimationFrame(() => {
				inputRef.current?.focus()
			})
		}
	}, [searchOpen])

	React.useEffect(() => {
		if (!searchOpen) setShowReplace(false)
	}, [searchOpen])

	useHotkey(
		'Escape',
		(event) => {
			event.preventDefault()
			propsRef.current.onSearchOpenChange(false)
		},
		{ enabled: searchOpen, preventDefault: true },
	)

	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent) => {
			event.stopPropagation()

			if (event.key === 'Enter') {
				event.preventDefault()
				if (event.shiftKey) {
					propsRef.current.onNavigateToPrevMatch()
				} else {
					propsRef.current.onNavigateToNextMatch()
				}
			}
		},
		[propsRef],
	)

	const debouncedSearch = useDebouncedCallback((query: string) => {
		propsRef.current.onSearch(query)
	}, 150)

	const onChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const value = event.target.value
			propsRef.current.onSearchQueryChange(value)
			debouncedSearch(value)
		},
		[propsRef, debouncedSearch],
	)

	const onReplaceChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			propsRef.current.onReplaceQueryChange(event.target.value)
		},
		[propsRef],
	)

	const onTriggerPointerDown = React.useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			const target = event.target
			if (!(target instanceof HTMLElement)) return
			if (target.hasPointerCapture(event.pointerId)) {
				target.releasePointerCapture(event.pointerId)
			}

			if (
				event.button === 0 &&
				event.ctrlKey === false &&
				event.pointerType === 'mouse' &&
				!(event.target instanceof HTMLInputElement)
			) {
				event.preventDefault()
			}
		},
		[],
	)

	const onPrevMatchPointerDown = React.useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) =>
			onTriggerPointerDown(event),
		[onTriggerPointerDown],
	)

	const onNextMatchPointerDown = React.useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) =>
			onTriggerPointerDown(event),
		[onTriggerPointerDown],
	)

	const onClose = React.useCallback(() => {
		propsRef.current.onSearchOpenChange(false)
	}, [propsRef])

	const onPrevMatch = React.useCallback(() => {
		propsRef.current.onNavigateToPrevMatch()
	}, [propsRef])

	const onNextMatch = React.useCallback(() => {
		propsRef.current.onNavigateToNextMatch()
	}, [propsRef])

	const handleReplaceNext = React.useCallback(() => {
		propsRef.current.onReplaceNext()
	}, [propsRef])

	const handleReplaceAll = React.useCallback(() => {
		propsRef.current.onReplaceAll()
	}, [propsRef])

	const canReplace =
		replaceEnabled &&
		searchQuery.trim().length > 0 &&
		searchMatches.length > 0 &&
		!searchRegexError

	const onReplaceKeyDown = React.useCallback(
		(event: React.KeyboardEvent) => {
			event.stopPropagation()
			if (!canReplace) return

			if (event.key === 'Enter') {
				event.preventDefault()
				propsRef.current.onReplaceNext()
			}
		},
		[canReplace, propsRef],
	)

	const onToggleReplace = React.useCallback(() => {
		setShowReplace((prev) => !prev)
	}, [])

	const searchToggleValues = React.useMemo(() => {
		const values: string[] = []
		if (searchCaseSensitive) values.push('case')
		if (searchWholeWord) values.push('word')
		if (searchRegex) values.push('regex')
		return values
	}, [searchCaseSensitive, searchWholeWord, searchRegex])

	const onSearchToggleGroupChange = React.useCallback(
		(values: string[]) => {
			const valueSet = new Set(values ?? [])
			const nextRegex = valueSet.has('regex')
			propsRef.current.onSearchRegexChange(nextRegex)
			propsRef.current.onSearchCaseSensitiveChange(valueSet.has('case'))
			propsRef.current.onSearchWholeWordChange(
				nextRegex ? false : valueSet.has('word'),
			)
		},
		[propsRef],
	)

	const selectionToggleValues = React.useMemo(
		() => (searchInSelection ? ['selection'] : []),
		[searchInSelection],
	)

	const onSelectionToggleGroupChange = React.useCallback(
		(values: string[]) => {
			const valueSet = new Set(values ?? [])
			propsRef.current.onSearchInSelectionChange(valueSet.has('selection'))
		},
		[propsRef],
	)

	const onTogglePointerDown = React.useCallback(
		(
			event: React.PointerEvent<HTMLButtonElement>,
			handler?: React.PointerEventHandler<HTMLButtonElement>,
		) => {
			handler?.(event)
			onTriggerPointerDown(event)
		},
		[onTriggerPointerDown],
	)

	const matchLabel = searchMatches.length
		? `${matchIndex + 1} of ${searchMatches.length}`
		: searchQuery
			? '0 of 0'
			: ''

	if (!searchOpen) return null

	return (
		<search
			data-slot='grid-search'
			className='fade-in-0 slide-in-from-top-2 absolute end-4 top-4 z-50 flex animate-in items-center gap-1.5 rounded-md border bg-background p-1.5 shadow-lg'
		>
			<Button
				aria-label='Toggle replace'
				variant='ghost'
				nativeButton={false}
				className='size-6'
				onClick={onToggleReplace}
				onPointerDown={onTriggerPointerDown}
				render={
					<ChevronDown
						className={cn('size-8 transition-transform', {
							'rotate-180': showReplace,
						})}
					/>
				}
			/>
			<div className='flex flex-col gap-1'>
				<div className='flex items-center gap-1.5'>
					<div className='relative'>
						<Input
							autoComplete='off'
							autoCorrect='off'
							autoCapitalize='off'
							spellCheck={false}
							placeholder='Find in table...'
							className='h-7 w-60 pr-28'
							ref={inputRef}
							value={searchQuery}
							onChange={onChange}
							onKeyDown={onKeyDown}
						/>
						<ToggleGroup
							multiple
							spacing={0}
							variant='outline'
							className='absolute end-0 top-0 flex h-full items-center border-none bg-transparent pr-1'
							size='sm'
							value={searchToggleValues}
							onValueChange={onSearchToggleGroupChange}
						>
							<SelectionTooltip
								label='Case sensitive'
								render={(props) => (
									<ToggleGroupItem
										{...props}
										value='case'
										aria-label='Match case'
										variant='outline'
										className='border-none data-pressed:bg-primary/20'
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
									>
										<CaseSensitive className='size-5' />
									</ToggleGroupItem>
								)}
							/>
							<SelectionTooltip
								label='Match whole word'
								render={(props) => (
									<ToggleGroupItem
										{...props}
										value='word'
										variant='outline'
										className='border-none data-pressed:bg-primary/20'
										aria-label='Match whole word'
										disabled={searchRegex}
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
									>
										<WholeWord className='size-5' />
									</ToggleGroupItem>
								)}
							/>
							<SelectionTooltip
								label='Use regex pattern'
								render={(props) => (
									<ToggleGroupItem
										{...props}
										value='regex'
										variant='outline'
										className='border-none data-pressed:bg-primary/20'
										aria-label='Use regex search'
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
									>
										<span className='font-mono text-[10px] leading-none'>
											.*
										</span>
									</ToggleGroupItem>
								)}
							/>
						</ToggleGroup>
					</div>
					<div className='flex items-center gap-1'>
						<Button
							aria-label='Previous match'
							variant='ghost'
							size='icon-sm'
							className='pointer-coarse:size-9 size-4'
							onClick={onPrevMatch}
							onPointerDown={onPrevMatchPointerDown}
							disabled={searchMatches.length === 0}
						>
							<ArrowUp className='size-full' />
						</Button>
						<Button
							aria-label='Next match'
							variant='ghost'
							size='icon-sm'
							className='pointer-coarse:size-9 size-4'
							onClick={onNextMatch}
							onPointerDown={onNextMatchPointerDown}
							disabled={searchMatches.length === 0}
						>
							<ArrowDown className='size-full' />
						</Button>
						<div className='w-9 text-nowrap text-muted-foreground text-xs'>
							{matchLabel}
						</div>
						<ToggleGroup
							multiple
							spacing={0}
							variant='outline'
							className='border-none bg-transparent'
							size='sm'
							value={selectionToggleValues}
							onValueChange={onSelectionToggleGroupChange}
						>
							<SelectionTooltip
								label='Search in selection'
								render={(props) => (
									<ToggleGroupItem
										{...props}
										value='selection'
										aria-label='Search in selection'
										variant='outline'
										className='border-none data-pressed:bg-primary/20'
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
									>
										<TextSelect className='size-5' />
									</ToggleGroupItem>
								)}
							/>
						</ToggleGroup>
						<Button
							aria-label='Close search'
							variant='ghost'
							size='icon-sm'
							className='pointer-coarse:size-9 size-6'
							onClick={onClose}
						>
							<X />
						</Button>
					</div>
				</div>
				{searchRegexError && (
					<div className='text-destructive text-xs'>{searchRegexError}</div>
				)}
				{showReplace && (
					<div className='flex items-center gap-2'>
						<Input
							autoComplete='off'
							autoCorrect='off'
							autoCapitalize='off'
							spellCheck={false}
							placeholder='Replace with...'
							className='h-7 w-full'
							value={replaceQuery}
							onChange={onReplaceChange}
							onKeyDown={onReplaceKeyDown}
							disabled={!replaceEnabled}
						/>
						<div className='flex items-center gap-1'>
							<SelectionTooltip
								label='Replace next occurrence'
								render={(props) => (
									<Button
										{...props}
										variant='ghost'
										size='icon-sm'
										className='size-6'
										aria-label='Replace next occurrence'
										onClick={(event) => {
											props.onClick?.(event)
											handleReplaceNext()
										}}
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
										disabled={!canReplace}
									>
										<Replace className='size-4' />
									</Button>
								)}
							/>
							<SelectionTooltip
								label='Replace all occurrences'
								render={(props) => (
									<Button
										{...props}
										variant='ghost'
										size='icon-sm'
										className='size-6'
										aria-label='Replace all occurrences'
										onClick={(event) => {
											props.onClick?.(event)
											handleReplaceAll()
										}}
										onPointerDown={(event) =>
											onTogglePointerDown(event, props.onPointerDown)
										}
										disabled={!canReplace}
									>
										<ReplaceAll className='size-4' />
									</Button>
								)}
							/>
						</div>
					</div>
				)}
			</div>
		</search>
	)
}

interface SelectionTooltipProps
	extends React.ComponentProps<typeof TooltipTrigger> {
	label: string
}

function SelectionTooltip({ label, ...props }: SelectionTooltipProps) {
	return (
		<Tooltip>
			<TooltipTrigger {...props} />
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}
