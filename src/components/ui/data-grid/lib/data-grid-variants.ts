import { cva, type VariantProps } from 'class-variance-authority'

export const dataGridContainerVariants = cva('w-full overflow-hidden', {
	variants: {
		variant: {
			default: 'rounded-md border border-border bg-card shadow-2xs',
			minimal: 'rounded border border-border/30',
			striped: 'rounded-md border border-border bg-card shadow-2xs',
			bordered: 'rounded-md border-2 border-border bg-card shadow-xs',
			compact: 'rounded border border-border bg-card/90 shadow-2xs',
			card: 'rounded-md border border-border bg-card shadow-xs',
			dense: 'rounded border border-border/80 bg-card/90',
			relaxed: 'rounded-md border border-border bg-card shadow-sm',
			flat: 'rounded border border-border/25 bg-transparent',
			lined: 'rounded-md border-0 bg-transparent',
			simple: 'rounded border border-border/50 bg-card/80',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

export const dataGridHeaderVariants = cva('border-border', {
	variants: {
		variant: {
			default: 'border-b bg-muted/40',
			minimal: 'border-border/30 border-b',
			striped: 'border-b bg-muted/35',
			bordered: 'border-b-2 bg-muted/45',
			compact: 'border-b bg-muted/45',
			card: 'border-b bg-muted/25',
			dense: 'border-b bg-muted/50',
			relaxed: 'border-b bg-muted/30',
			flat: 'border-border/25 border-b',
			lined: 'border-border border-b-2',
			simple: 'border-border/50 border-b bg-muted/20',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

export const dataGridRowVariants = cva(
	'transition-colors data-[state=selected]:bg-primary/12',
	{
		variants: {
			variant: {
				default: 'border-border/60 border-b hover:bg-muted/40',
				minimal: 'border-border/25 border-b hover:bg-muted/25',
				striped: 'border-border/50 border-b odd:bg-muted/15 hover:bg-muted/40',
				bordered: 'border-border border-b hover:bg-muted/40',
				compact: 'border-border/60 border-b hover:bg-muted/35',
				card: 'border-border/50 border-b hover:bg-muted/30',
				dense: 'border-border/50 border-b hover:bg-muted/35',
				relaxed: 'border-border/50 border-b hover:bg-muted/30',
				flat: 'border-border/20 border-b hover:bg-muted/20',
				lined: 'border-border border-b last:border-b-0 hover:bg-muted/30',
				simple: 'border-border/40 border-b hover:bg-muted/25',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

export const dataGridHeaderCellVariants = cva(
	'relative flex h-8 items-center text-left font-medium text-secondary-foreground/80 text-sm rtl:text-right',
	{
		variants: {
			variant: {
				default: 'px-3',
				minimal: 'px-2 text-secondary-foreground/60',
				striped: 'px-3',
				bordered: 'px-3',
				compact: 'h-7 px-2.5',
				card: 'px-3',
				dense: 'h-6 px-2 text-xs',
				relaxed: 'px-5',
				flat: 'px-3 text-secondary-foreground/60',
				lined: 'px-3 font-semibold text-secondary-foreground/90',
				simple: 'px-3',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

export const dataGridCellVariants = cva('align-middle', {
	variants: {
		variant: {
			default: 'px-3 py-1.5',
			minimal: 'px-2 py-1.5',
			striped: 'px-3 py-1.5',
			bordered: 'px-3 py-1.5',
			compact: 'px-2.5 py-1',
			card: 'px-3 py-2',
			dense: 'px-2 py-0.5 text-xs',
			relaxed: 'px-5 py-3',
			flat: 'px-3 py-1.5',
			lined: 'px-3 py-2',
			simple: 'px-3 py-1.5',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

export type TableVariant = NonNullable<
	VariantProps<typeof dataGridContainerVariants>['variant']
>
