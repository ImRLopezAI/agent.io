import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatTileProps {
	icon: LucideIcon
	label: string
	value: string
	delta?: string
	trend?: 'up' | 'down'
	note?: string
	className?: string
}

/** Compact KPI tile — icon box + label/value/delta. Mirrors the design's
 *  "C / Stat Tile / Icon" reusable component. */
export function StatTile({
	icon: Icon,
	label,
	value,
	delta,
	trend = 'up',
	note,
	className,
}: StatTileProps) {
	const TrendIcon = trend === 'up' ? ArrowUp : ArrowDown
	return (
		<div
			className={cn(
				'flex items-center gap-3 rounded-lg border border-border bg-card px-2',
				className,
			)}
		>
			<div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary'>
				<Icon className='size-4' />
			</div>
			<div className='flex min-w-0 flex-col gap-0.5'>
				<span className='font-bold font-caption text-[9px] text-muted-foreground/70 tracking-[1.2px]'>
					{label}
				</span>
				<span className='font-bold font-heading text-[1.125rem] text-foreground tabular-nums flex items-center gap-1.5'>
					{value}
					{(delta || note) && (
					<div className='flex items-center gap-1.5'>
						{delta && (
							<span
								className={cn(
									'flex items-center gap-0.5 font-caption font-semibold text-[11px]',
									trend === 'up' ? 'text-success' : 'text-destructive',
								)}
							>
								<TrendIcon className='size-3' />
								{delta}
							</span>
						)}
						{note && (
							<span className='font-caption text-[10px] text-muted-foreground'>
								{note}
							</span>
						)}
					</div>
				)}
				</span>

			</div>
		</div>
	)
}
