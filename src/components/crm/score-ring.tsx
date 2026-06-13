import { cn } from '@/lib/utils'

/** Circular lead/health score indicator with the value centered. */
export function ScoreRing({
	value,
	size = 32,
	className,
}: {
	value: number
	size?: number
	className?: string
}) {
	const stroke = 3
	const r = (size - stroke) / 2
	const c = 2 * Math.PI * r
	const pct = Math.max(0, Math.min(100, value)) / 100
	return (
		<div
			className={cn('relative shrink-0', className)}
			style={{ width: size, height: size }}
		>
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				className='-rotate-90'
				role='img'
				aria-label={`Score ${value}`}
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill='none'
					stroke='var(--muted)'
					strokeWidth={stroke}
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill='none'
					stroke='var(--success)'
					strokeWidth={stroke}
					strokeLinecap='round'
					strokeDasharray={c}
					strokeDashoffset={c * (1 - pct)}
				/>
			</svg>
			<span className='absolute inset-0 flex items-center justify-center font-bold font-caption text-[10px] text-foreground tabular-nums'>
				{value}
			</span>
		</div>
	)
}
