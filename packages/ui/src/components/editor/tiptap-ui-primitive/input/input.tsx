'use client'

import { cn } from '#/lib/tiptap-utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
	return (
		<input
			type={type}
			data-slot='tiptap-input'
			className={cn(
				'h-8 min-w-0 rounded-md border border-input bg-background px-2.5 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		/>
	)
}

export { Input }
