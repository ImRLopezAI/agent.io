import { cva, type VariantProps } from 'class-variance-authority'
import type { StatusKey } from '#/lib/constants'

export const badgeVariants = cva(
	'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-4xl border border-transparent px-2 py-0.5 font-medium text-xs transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				secondary:
					'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				destructive:
					'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
				outline:
					'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				ghost:
					'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
				neutral: 'border-border bg-muted text-muted-foreground',
				positive:
					'border-transparent bg-[color-mix(in_oklab,var(--color-primary)_16%,transparent)] text-primary',
				warning:
					'border-transparent bg-amber-500/12 text-amber-700 dark:text-amber-300',
				danger:
					'border-transparent bg-rose-500/12 text-rose-700 dark:text-rose-300',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

export function getBadgeVariantFromStatus(
	type: StatusKey,
): VariantProps<typeof badgeVariants>['variant'] {
	const normalizedType = type.toLowerCase()
	function matches(...args: string[]) {
		return args.some((arg) => normalizedType.includes(arg))
	}
	switch (true) {
		case matches('inactive', 'wont_fix'):
			return 'ghost'
		case matches('archived', 'duplicate', 'cannot_reproduce', 'subtask'):
			return 'outline'
		case matches('cancelled', 'critical'):
			return 'destructive'
		case matches('high', 'bug'):
			return 'danger'
		case matches(
			'incomplete',
			'pending',
			'on_hold',
			'delayed',
			'medium',
			'review',
		):
			return 'warning'
		case matches('backlog', 'ready_to_work', 'low', 'planned', 'epic', 'task'):
			return 'secondary'
		case matches('in_progress', 'story', 'completed', 'done', 'active'):
			return 'positive'
		default:
			return 'default'
	}
}
