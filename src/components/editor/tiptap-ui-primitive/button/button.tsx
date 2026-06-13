'use client'

import { Fragment, forwardRef, useMemo } from 'react'

// --- Tiptap UI Primitive ---
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '#/components/editor/tiptap-ui-primitive/tooltip'

// --- Lib ---
import { cn, parseShortcutKeys } from '#/lib/tiptap-utils'

export type ButtonVariant = 'ghost' | 'primary'
export type ButtonSize = 'small' | 'default' | 'large'

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	showTooltip?: boolean
	tooltip?: React.ReactNode
	shortcutKeys?: string
	variant?: ButtonVariant
	size?: ButtonSize
}

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({
	shortcuts,
}) => {
	if (shortcuts.length === 0) return null

	return (
		<div>
			{shortcuts.map((key, index) => (
				<Fragment key={index}>
					{index > 0 && <kbd>+</kbd>}
					<kbd>{key}</kbd>
				</Fragment>
			))}
		</div>
	)
}

const buttonClassName =
	'group/tiptap-button inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border-0 bg-transparent p-2 text-sm font-medium leading-[1.15] text-muted-foreground outline-none transition-colors duration-150 hover:enabled:bg-muted hover:enabled:text-foreground focus-visible:bg-muted focus-visible:text-foreground data-[focus-visible=true]:bg-muted data-[focus-visible=true]:text-foreground data-[highlighted=true]:bg-muted data-[highlighted=true]:text-foreground data-[active-item=true]:bg-muted data-[active-item=true]:text-foreground aria-[expanded=true]:bg-foreground aria-[expanded=true]:text-background aria-[expanded=true]:shadow-sm aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background aria-[pressed=true]:shadow-sm data-[active-state=on]:bg-foreground data-[active-state=on]:text-background data-[active-state=on]:shadow-sm data-[popup-open]:bg-foreground data-[popup-open]:text-background data-[popup-open]:shadow-sm data-[state=open]:bg-foreground data-[state=open]:text-background data-[state=open]:shadow-sm disabled:pointer-events-none disabled:cursor-default disabled:opacity-45 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45 data-[style=primary]:bg-primary data-[style=primary]:text-primary-foreground hover:enabled:data-[style=primary]:bg-primary/90 data-[size=large]:h-9.5 data-[size=large]:min-w-9.5 data-[size=large]:p-2.5 data-[size=large]:text-[0.9375rem] data-[size=small]:h-6 data-[size=small]:min-w-6 data-[size=small]:rounded-md data-[size=small]:p-[0.3125rem] data-[size=small]:text-xs [&_.tiptap-button-icon]:size-4 [&_.tiptap-button-icon]:shrink-0 [&_.tiptap-button-icon]:text-current data-[size=large]:[&_.tiptap-button-icon]:size-[1.125rem] data-[size=small]:[&_.tiptap-button-icon]:size-3.5 [&_.tiptap-button-text]:min-w-0 [&_.tiptap-button-text]:flex-1 [&_.tiptap-button-text]:px-0.5 [&_.tiptap-button-text]:text-left [&_.tiptap-button-text]:leading-6 data-[text-trim=on]:[&_.tiptap-button-text]:truncate [&_.tiptap-button-dropdown-small]:size-2.5 [&_.tiptap-button-dropdown-small]:shrink-0 data-[size=large]:[&_.tiptap-button-dropdown-small]:size-3 data-[size=small]:[&_.tiptap-button-dropdown-small]:size-2'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			children,
			tooltip,
			showTooltip = true,
			shortcutKeys,
			variant,
			size,
			...props
		},
		ref,
	) => {
		const shortcuts = useMemo<string[]>(
			() => parseShortcutKeys({ shortcutKeys }),
			[shortcutKeys],
		)

		if (!tooltip || !showTooltip) {
			return (
				<button
					data-slot='tiptap-button'
					className={cn(buttonClassName, className)}
					ref={ref}
					data-style={variant}
					data-size={size}
					{...props}
				>
					{children}
				</button>
			)
		}

		return (
			<Tooltip delay={200}>
				<TooltipTrigger
					data-slot='tiptap-button'
					className={cn(buttonClassName, className)}
					ref={ref}
					data-style={variant}
					data-size={size}
					{...props}
				>
					{children}
				</TooltipTrigger>
				<TooltipContent>
					{tooltip}
					<ShortcutDisplay shortcuts={shortcuts} />
				</TooltipContent>
			</Tooltip>
		)
	},
)

Button.displayName = 'Button'

export default Button
