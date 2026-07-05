'use client'

import { Button } from '@ui/button'
import { Collapsible, CollapsibleContent } from '@ui/collapsible'
import { Separator } from '@ui/separator'
import { cn } from 'cnfast'
import { Check, ChevronRight, Copy } from 'lucide-react'
import type { JSX } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useIsMobile } from '#/hooks/use-mobile'

interface JsonViewerProps {
	data: Record<string, any>
	className?: string
	truncation?: Partial<TruncationSettings>
	showLineNumbers?: boolean
	showColorIndent?: boolean
	collapseOn?: 'click' | 'doubleClick'
	defaultExpanded?: boolean | number
	title?: string
}

interface TruncationSettings {
	enabled: boolean
	itemsPerArray: number
}

type DataType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'null'
	| 'object'
	| 'array'
	| 'unknown'

const getDataType = (value: any): DataType => {
	if (value === null) return 'null'
	if (Array.isArray(value)) return 'array'
	const type = typeof value
	if (
		type === 'string' ||
		type === 'number' ||
		type === 'boolean' ||
		type === 'object'
	) {
		return type
	}
	return 'unknown'
}

const getTypeStyle = (type: DataType): string => {
	switch (type) {
		case 'string':
			return 'text-green-600 dark:text-green-400'
		case 'number':
			return 'text-orange-600 dark:text-orange-400'
		case 'boolean':
			return 'text-blue-600 dark:text-blue-400'
		case 'null':
			return 'text-gray-500 dark:text-gray-400'
		default:
			return ''
	}
}

const formatRelativeTime = (date: Date): string => {
	const now = new Date()
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

	if (Math.abs(diffInSeconds) < 60) return 'just now'

	const intervals = {
		year: 31536000,
		month: 2592000,
		week: 604800,
		day: 86400,
		hour: 3600,
		minute: 60,
	}

	for (const [unit, seconds] of Object.entries(intervals)) {
		const interval = Math.floor(Math.abs(diffInSeconds) / seconds)
		if (interval >= 1) {
			const suffix = diffInSeconds > 0 ? 'ago' : 'from now'
			return `${interval} ${unit}${interval !== 1 ? 's' : ''} ${suffix}`
		}
	}

	return 'just now'
}

const detectDate = (value: any): Date | null => {
	if (typeof value === 'string') {
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
			const date = new Date(value)
			if (!Number.isNaN(date.getTime())) {
				return date
			}
		}
	} else if (typeof value === 'number') {
		if (value >= 946684800 && value <= 4102444800) {
			return new Date(value * 1000)
		}
		if (value >= 946684800000 && value <= 4102444800000) {
			return new Date(value)
		}
	}
	return null
}

const SmartValue = React.forwardRef<
	any,
	{ value: any; type: DataType } & React.HTMLAttributes<HTMLElement>
>(({ value, type, ...props }, ref) => {
	const [isExpanded, setIsExpanded] = useState(false)

	if (type === 'string') {
		if (
			/^#([0-9A-F]{3}){1,2}$/i.test(value) ||
			/^rgba?\(/.test(value) ||
			/^hsla?\(/.test(value)
		) {
			return (
				<span
					ref={ref}
					{...props}
					className={cn(
						'inline-flex items-center gap-1.5 whitespace-nowrap',
						props.className,
					)}
				>
					<span
						className='h-3 w-3 shrink-0 rounded-[2px] border border-white/20'
						style={{ backgroundColor: value }}
					/>
					<span className='text-green-600 dark:text-green-400'>{`'${value}'`}</span>
				</span>
			)
		}

		if (/^https?:\/\//.test(value)) {
			const isLongUrl = String(value).length > 50
			const isVeryLongUrl = String(value).length > 180

			if (isVeryLongUrl) {
				return (
					<span className='inline-flex flex-col items-start gap-1'>
						<a
							ref={ref}
							href={value}
							target='_blank'
							rel='noopener noreferrer'
							{...(props as any)}
							className={cn(
								'whitespace-pre-wrap break-all text-green-600 transition-colors hover:text-blue-600 hover:underline dark:text-green-400 dark:hover:text-blue-400',
								!isExpanded && 'line-clamp-3',
								props.className,
							)}
							style={
								!isExpanded
									? {
											display: '-webkit-box',
											WebkitLineClamp: 3,
											WebkitBoxOrient: 'vertical',
											overflow: 'hidden',
										}
									: undefined
							}
							onClick={(e) => {
								e.stopPropagation()
								props.onClick?.(e)
							}}
						>
							{`'${value}'`}
						</a>
						<Button
							variant='link'
							size='sm'
							onClick={(e) => {
								e.stopPropagation()
								setIsExpanded(!isExpanded)
							}}
							className='h-auto select-none p-0 text-muted-foreground text-xs underline hover:text-foreground'
						>
							{isExpanded ? 'Show less' : 'Show more'}
						</Button>
					</span>
				)
			}

			return (
				<a
					ref={ref}
					href={value}
					target='_blank'
					rel='noopener noreferrer'
					{...(props as any)}
					className={cn(
						'text-green-600 transition-colors hover:text-blue-600 hover:underline dark:text-green-400 dark:hover:text-blue-400',
						isLongUrl ? 'whitespace-pre-wrap break-all' : 'whitespace-nowrap',
						props.className,
					)}
					onClick={(e) => {
						e.stopPropagation()
						props.onClick?.(e)
					}}
				>
					{`'${value}'`}
				</a>
			)
		}
	}

	const typeStyle = getTypeStyle(type)
	if (type === 'string') {
		const isLongString = String(value).length > 50
		const isVeryLongString = String(value).length > 180

		if (isVeryLongString) {
			return (
				<span className='inline-flex flex-col items-start gap-1'>
					<span
						ref={ref}
						{...props}
						className={cn(
							typeStyle,
							'wrap-break-words whitespace-pre-wrap',
							!isExpanded && 'line-clamp-3',
							props.className,
						)}
						style={
							!isExpanded
								? {
										display: '-webkit-box',
										WebkitLineClamp: 3,
										WebkitBoxOrient: 'vertical',
										overflow: 'hidden',
									}
								: undefined
						}
					>
						{`'${value}'`}
					</span>
					<Button
						variant='link'
						size='sm'
						onClick={(e) => {
							e.stopPropagation()
							setIsExpanded(!isExpanded)
						}}
						className='h-auto select-none p-0 text-muted-foreground text-xs underline hover:text-foreground'
					>
						{isExpanded ? 'Show less' : 'Show more'}
					</Button>
				</span>
			)
		}

		return (
			<span
				ref={ref}
				{...props}
				className={cn(
					typeStyle,
					isLongString
						? 'wrap-break-words whitespace-pre-wrap'
						: 'whitespace-nowrap',
					props.className,
				)}
			>
				{`'${value}'`}
			</span>
		)
	}
	if (type === 'null')
		return (
			<span
				ref={ref}
				{...props}
				className={cn(typeStyle, 'whitespace-nowrap', props.className)}
			>
				null
			</span>
		)
	return (
		<span
			ref={ref}
			{...props}
			className={cn(typeStyle, 'whitespace-nowrap', props.className)}
		>
			{String(value)}
		</span>
	)
})
SmartValue.displayName = 'SmartValue'

const calculateLineCount = (
	data: any,
	expandedPaths: Set<string>,
	path = 'root',
	level = 0,
	truncation: TruncationSettings,
): number => {
	const dataType = getDataType(data)

	if (dataType === 'object') {
		const isOpen = expandedPaths.has(path)
		if (!isOpen) return 1
		const entries = Object.entries(data)
		if (entries.length === 0) return 2
		return (
			2 +
			entries.reduce(
				(acc, [key, value]) =>
					acc +
					calculateLineCount(
						value,
						expandedPaths,
						`${path}.${key}`,
						level + 1,
						truncation,
					),
				0,
			)
		)
	}

	if (dataType === 'array') {
		const isOpen = expandedPaths.has(path)
		if (!isOpen) return 1
		if (data.length === 0) return 2

		if (truncation.enabled && data.length > truncation.itemsPerArray) {
			const visibleItems = data.slice(0, truncation.itemsPerArray)
			return (
				3 +
				visibleItems.reduce(
					(acc: number, item: any, index: number) =>
						acc +
						calculateLineCount(
							item,
							expandedPaths,
							`${path}[${index}]`,
							level + 1,
							truncation,
						),
					0,
				)
			)
		}

		return (
			2 +
			data.reduce(
				(acc: number, item: any, index: number) =>
					acc +
					calculateLineCount(
						item,
						expandedPaths,
						`${path}[${index}]`,
						level + 1,
						truncation,
					),
				0,
			)
		)
	}

	return 1
}

const generateAllPaths = (
	data: any,
	maxLevel: number = Infinity,
	currentLevel: number = 0,
	currentPath: string = 'root',
): Set<string> => {
	const paths = new Set<string>()
	if (currentLevel > maxLevel) return paths

	if (typeof data === 'object' && data !== null) {
		paths.add(currentPath)
		if (Array.isArray(data)) {
			data.forEach((item, index) => {
				const childPaths = generateAllPaths(
					item,
					maxLevel,
					currentLevel + 1,
					`${currentPath}[${index}]`,
				)
				// childPaths.forEach((path) => paths.add(path))
				for (const path of childPaths) {
					paths.add(path)
				}
			})
		} else {
			Object.entries(data).forEach(([key, value]) => {
				const childPaths = generateAllPaths(
					value,
					maxLevel,
					currentLevel + 1,
					`${currentPath}.${key}`,
				)
				// childPaths.forEach((path) => paths.add(path))
				for (const path of childPaths) {
					paths.add(path)
				}
			})
		}
	}
	return paths
}

const JsonViewer: React.FC<JsonViewerProps> = ({
	data,
	className,
	truncation: truncationProp,
	showLineNumbers = true,
	showColorIndent = false,
	collapseOn = 'click',
	defaultExpanded = false,
	title,
}) => {
	const isMobile = useIsMobile()

	const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => {
		if (typeof defaultExpanded === 'number') {
			return generateAllPaths(data, defaultExpanded)
		}
		if (defaultExpanded === true) {
			return generateAllPaths(data)
		}
		const initialPaths = new Set<string>()
		if (typeof data === 'object' && data !== null) {
			initialPaths.add('root')
		}
		return initialPaths
	})

	const expandAll = () => {
		setExpandedPaths(generateAllPaths(data))
	}

	const collapseAll = () => {
		setExpandedPaths(new Set(['root']))
	}

	const [copied, setCopied] = useState(false)
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => {
		return () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
		}
	}, [])
	const handleCopy = useCallback(async () => {
		try {
			const text = JSON.stringify(data, null, 2)
			await navigator.clipboard.writeText(text)
			setCopied(true)
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
			copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
		} catch {
			// Clipboard access denied or unavailable — silently fail; users see no
			// state change so they can retry. We deliberately don't toast here to
			// keep this component dependency-free.
		}
	}, [data])

	const truncation: TruncationSettings = React.useMemo(
		() => ({
			enabled: isMobile ? false : (truncationProp?.enabled ?? true),
			itemsPerArray: truncationProp?.itemsPerArray ?? 5,
		}),
		[truncationProp, isMobile],
	)

	const toggleNode = (path: string) => {
		setExpandedPaths((prev) => {
			const newPaths = new Set(prev)
			if (newPaths.has(path)) {
				newPaths.delete(path)
			} else {
				newPaths.add(path)
			}
			return newPaths
		})
	}

	const lineCount = useMemo(
		() => calculateLineCount(data, expandedPaths, 'root', 0, truncation),
		[data, expandedPaths, truncation],
	)

	return (
		<div
			className={cn(
				'relative flex w-full flex-col rounded-md border border-border bg-secondary/10 font-mono text-[13px] text-foreground leading-6 dark:bg-muted/50',
				className,
			)}
		>
			<div className='z-10 flex items-center justify-between gap-2 p-2'>
				<div className='px-2 font-medium text-muted-foreground text-xs'>
					{title}
				</div>
				<div className='flex items-center overflow-hidden rounded-md border bg-muted/50'>
					<Button
						variant='ghost'
						size='sm'
						onClick={expandAll}
						className='h-7 rounded-none px-2 text-xs hover:bg-muted'
						title='Expand All'
					>
						Expand All
					</Button>
					<Separator orientation='vertical' className='h-4' />
					<Button
						variant='ghost'
						size='sm'
						onClick={collapseAll}
						className='h-7 rounded-none px-2 text-xs hover:bg-muted'
						title='Collapse All'
					>
						Collapse All
					</Button>
					<Separator orientation='vertical' className='h-4' />
					<Button
						variant='ghost'
						size='sm'
						onClick={handleCopy}
						aria-label={copied ? 'Copied' : 'Copy JSON'}
						className='h-7 gap-1.5 rounded-none px-2 text-xs hover:bg-muted'
						title={copied ? 'Copied' : 'Copy JSON'}
					>
						{copied ? (
							<Check className='size-3.5 text-green-600 dark:text-green-400' />
						) : (
							<Copy className='size-3.5' />
						)}
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>
			</div>
			<div className='w-full flex-1 overflow-auto p-4 pt-0'>
				<pre className='flex'>
					{showLineNumbers && (
						<div className='hidden sm:block'>
							<LineNumbers lineCount={lineCount} />
						</div>
					)}
					<code>
						<JsonNode
							data={data}
							path='root'
							expandedPaths={expandedPaths}
							toggleNode={toggleNode}
							truncation={truncation}
							showColorIndent={showColorIndent}
							collapseOn={collapseOn}
						/>
					</code>
				</pre>
			</div>
		</div>
	)
}

const LineNumbers: React.FC<{ lineCount: number }> = ({ lineCount }) => {
	return (
		<div className='mr-4 flex select-none flex-col border-border border-r pr-4 text-right text-muted-foreground'>
			{Array.from({ length: lineCount }, (_, i) => (
				<div key={i} className='h-6 text-xs tabular-nums leading-6 opacity-50'>
					{i + 1}
				</div>
			))}
		</div>
	)
}

interface JsonNodeProps {
	data: any
	level?: number
	path: string
	expandedPaths: Set<string>
	toggleNode: (path: string) => void
	showComma?: boolean
	objectKey?: string
	truncation: TruncationSettings
	showColorIndent?: boolean
	collapseOn?: 'click' | 'doubleClick'
}

const JsonNode: React.FC<JsonNodeProps> = ({
	data,
	level = 0,
	path,
	expandedPaths,
	toggleNode,
	showComma,
	objectKey,
	truncation,
	showColorIndent,
	collapseOn,
}) => {
	const dataType = getDataType(data)

	const renderValue = () => {
		let element: JSX.Element | null = null
		switch (dataType) {
			case 'array':
				element = (
					<JsonArray
						data={data}
						level={level}
						path={path}
						expandedPaths={expandedPaths}
						toggleNode={toggleNode}
						showComma={showComma}
						objectKey={objectKey}
						truncation={truncation}
						showColorIndent={showColorIndent}
						collapseOn={collapseOn}
					/>
				)
				break
			case 'object':
				element = (
					<JsonObject
						data={data}
						level={level}
						path={path}
						expandedPaths={expandedPaths}
						toggleNode={toggleNode}
						showComma={showComma}
						objectKey={objectKey}
						truncation={truncation}
						showColorIndent={showColorIndent}
						collapseOn={collapseOn}
					/>
				)
				break
			default:
				element = <SmartValue value={data} type={dataType} />
				break
		}

		if (dataType === 'object' || dataType === 'array') {
			return element
		}

		const date = detectDate(data)
		if (date) {
			const timeStr = formatRelativeTime(date)
			return (
				<span className='inline-flex items-center gap-2'>
					{element}
					<span className='select-none text-muted-foreground/60 text-xs italic'>
						{`// ${timeStr}`}
					</span>
				</span>
			)
		}

		return element
	}

	return (
		<>
			{renderValue()}
			{dataType !== 'object' && dataType !== 'array' && showComma && (
				<span className='text-muted-foreground'>,</span>
			)}
		</>
	)
}

const indentColors = [
	'border-red-300/60 dark:border-red-700/60',
	'border-yellow-300/60 dark:border-yellow-700/60',
	'border-green-300/60 dark:border-green-700/60',
	'border-blue-300/60 dark:border-blue-700/60',
	'border-purple-300/60 dark:border-purple-700/60',
]

const JsonObject: React.FC<{
	objectKey?: string
	data: Record<string, any>
	level: number
	path: string
	expandedPaths: Set<string>
	toggleNode: (path: string) => void
	showComma?: boolean
	truncation: TruncationSettings
	showColorIndent?: boolean
	collapseOn?: 'click' | 'doubleClick'
}> = ({
	data,
	level,
	path,
	expandedPaths,
	toggleNode,
	showComma,
	objectKey,
	truncation,
	showColorIndent,
	collapseOn,
}) => {
	const entries = Object.entries(data)
	const isOpen = expandedPaths.has(path)

	const trigger = (
		<div
			className={cn(
				'group -ml-1 inline-flex h-6 w-full cursor-pointer select-none items-center rounded-sm px-1 text-left leading-6',
				isOpen && 'hover:bg-muted-foreground/20',
			)}
			onDoubleClick={
				collapseOn === 'doubleClick' ? () => toggleNode(path) : undefined
			}
			onClick={
				collapseOn === 'doubleClick'
					? undefined
					: (_e) => {
							toggleNode(path)
						}
			}
		>
			{objectKey && (
				<span className='group inline-flex items-center font-medium text-purple-600 dark:text-purple-400'>
					{`'${objectKey}'`}
					<span className='mx-1 text-muted-foreground'>: </span>
				</span>
			)}
			<Button
				variant='ghost'
				size='icon'
				onClick={(e) => {
					e.stopPropagation()
					toggleNode(path)
				}}
				className='h-4 w-4 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
			>
				<ChevronRight
					className={cn(
						'h-4 w-4 shrink-0 transition-transform',
						isOpen && 'rotate-90',
					)}
				/>
			</Button>
			<span className='text-muted-foreground'>{'{'}</span>
			{!isOpen && (
				<>
					<span className='text-muted-foreground'>...</span>
					<span className='text-muted-foreground'>
						{'}'} ({entries.length} {entries.length > 1 ? 'items' : 'item'})
					</span>
					{showComma && <span className='text-muted-foreground'>,</span>}
				</>
			)}
		</div>
	)

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={() => toggleNode(path)}
			render={<div />}
		>
			{trigger}
			<CollapsibleContent className='transition-all duration-200'>
				<div
					className={cn(
						'border-l pl-5',
						showColorIndent
							? indentColors[level % indentColors.length]
							: 'border-[rgba(0,0,0,0.1)] dark:border-[rgba(255,255,255,0.1)]',
					)}
				>
					{entries.map(([key, value], index) => {
						const childPath = `${path}.${key}`
						const dataType = getDataType(value)
						const isChildCollapsible =
							dataType === 'object' || dataType === 'array'
						const isChildOpen =
							isChildCollapsible && expandedPaths.has(childPath)

						return (
							<div
								key={key}
								className={cn(
									'group rounded-md',
									!isChildCollapsible && 'flex min-h-6 items-start',
									isChildOpen ? '' : 'hover:bg-muted-foreground/20',
								)}
							>
								{isChildCollapsible ? (
									<JsonNode
										data={value}
										level={level + 1}
										path={childPath}
										expandedPaths={expandedPaths}
										toggleNode={toggleNode}
										showComma={index < entries.length - 1}
										objectKey={key}
										truncation={truncation}
										showColorIndent={showColorIndent}
										collapseOn={collapseOn}
									/>
								) : (
									<>
										<span className='inline-flex items-center text-purple-600 dark:text-purple-400'>
											{`'${key}'`}
										</span>
										<span className='text-muted-foreground'>: </span>
										<JsonNode
											data={value}
											level={level + 1}
											path={childPath}
											expandedPaths={expandedPaths}
											toggleNode={toggleNode}
											showComma={index < entries.length - 1}
											truncation={truncation}
											showColorIndent={showColorIndent}
											collapseOn={collapseOn}
										/>
									</>
								)}
							</div>
						)
					})}
				</div>
				<div>
					<span className='text-muted-foreground'>{'}'}</span>
					{showComma && <span className='text-muted-foreground'>,</span>}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

const JsonArray: React.FC<{
	objectKey?: string
	data: any[]
	level: number
	path: string
	expandedPaths: Set<string>
	toggleNode: (path: string) => void
	showComma?: boolean
	truncation: TruncationSettings
	showColorIndent?: boolean
	collapseOn?: 'click' | 'doubleClick'
}> = ({
	data,
	level,
	path,
	expandedPaths,
	toggleNode,
	showComma,
	objectKey,
	truncation,
	showColorIndent,
	collapseOn,
}) => {
	const isOpen = expandedPaths.has(path)
	const [showAll, setShowAll] = useState(false)

	const itemsToShow =
		truncation.enabled && !showAll && data.length > truncation.itemsPerArray
			? data.slice(0, truncation.itemsPerArray)
			: data

	const handleShowMore = () => {
		setShowAll(true)
	}

	const trigger = (
		<div
			className={cn(
				'group -ml-1 inline-flex h-6 w-full cursor-pointer select-none items-center rounded-sm px-1 text-left leading-6',
				isOpen && 'hover:bg-muted-foreground/20',
			)}
			onDoubleClick={
				collapseOn === 'doubleClick' ? () => toggleNode(path) : undefined
			}
			onClick={
				collapseOn === 'doubleClick'
					? undefined
					: (_e) => {
							toggleNode(path)
						}
			}
		>
			{objectKey && (
				<span className='group inline-flex items-center text-purple-600 dark:text-purple-400'>
					{`'${objectKey}'`}
					<span className='mx-1 text-muted-foreground'>: </span>
				</span>
			)}
			<Button
				variant='ghost'
				size='icon'
				onClick={(e) => {
					e.stopPropagation()
					toggleNode(path)
				}}
				className='h-4 w-4 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
			>
				<ChevronRight
					className={cn(
						'h-4 w-4 shrink-0 transition-transform',
						isOpen && 'rotate-90',
					)}
				/>
			</Button>
			<span className='text-muted-foreground'>{'['}</span>
			{!isOpen && (
				<>
					<span className='text-muted-foreground'>...</span>
					<span className='text-muted-foreground'>
						{']'} ({data.length} items)
					</span>
					{showComma && <span className='text-muted-foreground'>,</span>}
				</>
			)}
		</div>
	)

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={() => toggleNode(path)}
			render={<div />}
		>
			{trigger}
			<CollapsibleContent className='transition-all duration-200'>
				<div
					className={cn(
						'border-l pl-5',
						showColorIndent
							? indentColors[level % indentColors.length]
							: 'border-[rgba(0,0,0,0.1)] dark:border-[rgba(255,255,255,0.1)]',
					)}
				>
					{itemsToShow.map((item, index) => {
						const childPath = `${path}[${index}]`
						const dataType = getDataType(item)
						const isChildCollapsible =
							dataType === 'object' || dataType === 'array'
						const isChildOpen =
							isChildCollapsible && expandedPaths.has(childPath)

						return (
							<div
								key={index}
								className={cn(
									'group rounded-md',
									!isChildCollapsible &&
										'flex h-auto items-start sm:h-6 sm:items-center',
									isChildOpen ? '' : 'hover:bg-muted-foreground/20',
								)}
							>
								<JsonNode
									data={item}
									level={level + 1}
									path={childPath}
									expandedPaths={expandedPaths}
									toggleNode={toggleNode}
									showComma={index < data.length - 1}
									truncation={truncation}
									showColorIndent={showColorIndent}
									collapseOn={collapseOn}
								/>
							</div>
						)
					})}
					{truncation.enabled && data.length > truncation.itemsPerArray && (
						<div className='pl-5'>
							{!showAll ? (
								<Button
									variant='secondary'
									size='sm'
									onClick={handleShowMore}
									className='mt-1 h-auto bg-secondary/30 px-2 py-0.5 text-muted-foreground text-xs hover:bg-secondary/50 hover:text-foreground'
								>
									Show {data.length - truncation.itemsPerArray} more items...
								</Button>
							) : (
								<Button
									variant='secondary'
									size='sm'
									onClick={() => setShowAll(false)}
									className='mt-1 h-auto bg-secondary/30 px-2 py-0.5 text-muted-foreground text-xs hover:bg-secondary/50 hover:text-foreground'
								>
									Show Less
								</Button>
							)}
						</div>
					)}
				</div>
				<div>
					<span className='text-muted-foreground'>]</span>
					{showComma && <span className='text-muted-foreground'>,</span>}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

export default JsonViewer
