'use client'

import { Badge } from '@ui/badge'
import { Separator } from '@ui/separator'
import { cn } from '#/lib/utils'

type ChangelogCategory = {
	id: string
	label: string
}

type ChangelogEntry = {
	id: string
	date: string
	version: string
	category: string
	title: string
	description: string
	imageUrl?: string
	imageAlt?: string
	bullets?: string[]
}

type ChangelogProps = {
	title?: string
	subtitle?: string
	categories?: ChangelogCategory[]
	/**
	 * Currently selected category id. Resolved from json-render state (e.g.
	 * `{ $state: '/ui/activeCategory' }`) — the Changelog is purely prop-driven
	 * and holds no internal state of its own.
	 */
	activeCategoryId?: string
	entries: ChangelogEntry[]
	loadMoreLabel?: string
	loadMoreHref?: string
	className?: string
	/**
	 * Fires when the operator clicks a filter badge. The Sunday registry wraps
	 * this to emit a json-render event (`select:<categoryId>`) so the spec
	 * action handler owns where the active category is written in state.
	 */
	onSelectCategory?: (categoryId: string) => void
}

const ALL_CATEGORY_ID = 'all'

/**
 * Maps a filter category id (from `categories[].id`) to the entry
 * `category` string values it should match. We intentionally handle the
 * singular/plural and capitalization drift between filter ids like
 * "features" and entry labels like "Feature".
 */
const CATEGORY_MATCHERS: Record<string, readonly string[]> = {
	breaking: ['breaking change', 'breaking changes'],
	features: ['feature', 'features', 'major release'],
	improvements: ['improvement', 'improvements'],
	fixes: ['fix', 'fixes', 'bug fix', 'bug fixes'],
}

function entryMatchesCategory(entry: ChangelogEntry, categoryId: string) {
	if (!categoryId || categoryId === ALL_CATEGORY_ID) {
		return true
	}
	const normalized = entry.category.trim().toLowerCase()
	const matchers = CATEGORY_MATCHERS[categoryId]
	if (!matchers) {
		return normalized === categoryId.trim().toLowerCase()
	}
	return matchers.includes(normalized)
}

function Changelog({
	title = 'Changelog',
	subtitle = 'All the latest updates, improvements, and fixes.',
	categories,
	activeCategoryId,
	entries,
	loadMoreLabel,
	loadMoreHref,
	className,
	onSelectCategory,
}: ChangelogProps) {
	const selectedCategoryId = activeCategoryId ?? ALL_CATEGORY_ID
	const filteredEntries = entries.filter((entry) =>
		entryMatchesCategory(entry, selectedCategoryId),
	)

	return (
		<div
			className={cn(
				'mx-auto w-full max-w-[960px] bg-background text-foreground',
				className,
			)}
			data-slot='changelog'
		>
			<ChangelogHero
				title={title}
				subtitle={subtitle}
				categories={categories}
				activeCategoryId={selectedCategoryId}
				onSelectCategory={onSelectCategory}
			/>
			<div className='flex flex-col px-16'>
				{filteredEntries.length === 0 ? (
					<div className='py-16 text-center text-muted-foreground text-sm'>
						No entries in this category yet.
					</div>
				) : (
					filteredEntries.map((entry, index) => (
						<div key={entry.id}>
							{index > 0 ? <Separator /> : null}
							<ChangelogEntryRow entry={entry} />
						</div>
					))
				)}
			</div>
			{loadMoreLabel && loadMoreHref ? (
				<div className='border-border border-t px-16 py-10'>
					<div className='flex justify-center'>
						<a
							href={loadMoreHref}
							className='inline-flex items-center rounded-full border border-foreground px-8 py-3 font-medium text-foreground text-sm transition-colors hover:bg-foreground hover:text-background'
						>
							{loadMoreLabel}
						</a>
					</div>
				</div>
			) : null}
		</div>
	)
}

function ChangelogHero({
	title,
	subtitle,
	categories,
	activeCategoryId,
	onSelectCategory,
}: Pick<
	ChangelogProps,
	'title' | 'subtitle' | 'categories' | 'activeCategoryId'
> & {
	onSelectCategory?: (id: string) => void
}) {
	return (
		<div className='flex flex-col items-center gap-4 px-16 pt-[72px] pb-12 text-center'>
			<h1 className='font-bold text-[64px] text-foreground leading-[1.05] tracking-tight'>
				{title}
			</h1>
			<p className='text-[18px] text-muted-foreground'>{subtitle}</p>
			{categories && categories.length > 0 ? (
				<div
					role='tablist'
					aria-label='Filter changelog by category'
					className='flex flex-wrap items-center justify-center gap-2 pt-4'
				>
					{categories.map((category) => {
						const isActive = category.id === activeCategoryId
						return (
							<button
								key={category.id}
								type='button'
								role='tab'
								aria-selected={isActive}
								onClick={() => onSelectCategory?.(category.id)}
								className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
							>
								<Badge
									variant={isActive ? 'default' : 'outline'}
									className='h-auto cursor-pointer rounded-full px-[18px] py-2 text-[13px]'
								>
									{category.label}
								</Badge>
							</button>
						)
					})}
				</div>
			) : null}
		</div>
	)
}

function ChangelogEntryRow({ entry }: { entry: ChangelogEntry }) {
	return (
		<article className='grid grid-cols-[200px_1fr] gap-[60px] py-12'>
			<ChangelogEntryMeta entry={entry} />
			<ChangelogEntryBody entry={entry} />
		</article>
	)
}

function ChangelogEntryMeta({ entry }: { entry: ChangelogEntry }) {
	return (
		<div className='flex flex-col items-start gap-3'>
			<p className='text-[13px] text-muted-foreground uppercase tracking-[0.05em]'>
				{entry.date}
			</p>
			<Badge variant='default' className='rounded-full px-[10px] py-1'>
				{entry.version}
			</Badge>
			<Badge variant='outline' className='rounded-full px-[10px] py-1'>
				{entry.category}
			</Badge>
		</div>
	)
}

function ChangelogEntryBody({ entry }: { entry: ChangelogEntry }) {
	return (
		<div className='flex flex-col gap-4'>
			<h2 className='font-normal text-[28px] text-foreground leading-[1.2] tracking-tight'>
				{entry.title}
			</h2>
			<p className='text-[15px] text-muted-foreground leading-[1.6]'>
				{entry.description}
			</p>
			{entry.bullets && entry.bullets.length > 0 ? (
				<ul className='flex flex-col gap-2 pt-2'>
					{entry.bullets.map((bullet) => (
						<li
							key={bullet}
							className='text-[14px] text-muted-foreground leading-[1.6]'
						>
							• {bullet}
						</li>
					))}
				</ul>
			) : null}
			{entry.imageUrl ? (
				<ChangelogEntryImage
					src={entry.imageUrl}
					alt={entry.imageAlt ?? entry.title}
				/>
			) : null}
		</div>
	)
}

function ChangelogEntryImage({ src, alt }: { src: string; alt: string }) {
	return (
		<figure
			className='mt-2 h-[240px] w-full overflow-hidden rounded-md bg-muted'
			aria-label={alt}
			style={{
				backgroundImage: `url(${src})`,
				backgroundSize: 'cover',
				backgroundPosition: 'center',
			}}
		/>
	)
}

export type { ChangelogCategory, ChangelogEntry, ChangelogProps }
export { Changelog }
