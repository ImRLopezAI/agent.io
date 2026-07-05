'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { CheckIcon } from '#/components/editor/tiptap-icons/check-icon'
import { cn } from 'cnfast'

const menuContentClassName =
	'z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none'
const menuItemClassName =
	'group relative flex min-h-6 w-full cursor-default select-none items-center justify-start gap-2 rounded-md px-2 py-1 text-left text-sm text-foreground outline-none transition-colors aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background data-[active-state=on]:bg-foreground data-[active-state=on]:text-background data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45 data-[inset=true]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10'
const menuIndicatorClassName =
	'absolute left-2 flex size-4 items-center justify-center text-foreground [&_svg]:size-3.5'

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot='tiptap-dropdown-menu' {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
	return (
		<MenuPrimitive.Portal data-slot='tiptap-dropdown-menu-portal' {...props} />
	)
}

function DropdownMenuTrigger({
	onPointerDown,
	...props
}: MenuPrimitive.Trigger.Props) {
	return (
		<MenuPrimitive.Trigger
			data-slot='tiptap-dropdown-menu-trigger'
			onPointerDown={(event) => {
				event.stopPropagation()
				onPointerDown?.(event)
			}}
			{...props}
		/>
	)
}

function DropdownMenuContent({
	className,
	align = 'start',
	alignOffset = 0,
	side = 'bottom',
	sideOffset = 4,
	...props
}: MenuPrimitive.Popup.Props &
	Pick<
		MenuPrimitive.Positioner.Props,
		'align' | 'alignOffset' | 'side' | 'sideOffset'
	>) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className='isolate z-50 outline-none'
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot='tiptap-dropdown-menu-content'
					className={cn(menuContentClassName, className)}
					finalFocus={false}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	)
}

function DropdownMenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
	return (
		<MenuPrimitive.Group
			data-slot='tiptap-dropdown-menu-group'
			className={cn('flex flex-col items-stretch gap-0.5', className)}
			{...props}
		/>
	)
}

function DropdownMenuItem({
	className,
	inset,
	variant = 'default',
	...props
}: MenuPrimitive.Item.Props & {
	inset?: boolean
	variant?: 'default' | 'destructive'
}) {
	return (
		<MenuPrimitive.Item
			data-slot='tiptap-dropdown-menu-item'
			data-inset={inset}
			data-variant={variant}
			className={cn(menuItemClassName, className)}
			{...props}
		/>
	)
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: MenuPrimitive.CheckboxItem.Props & {
	inset?: boolean
}) {
	return (
		<MenuPrimitive.CheckboxItem
			data-slot='tiptap-dropdown-menu-checkbox-item'
			data-inset={inset}
			className={cn(menuItemClassName, 'pl-8', className)}
			checked={checked}
			{...props}
		>
			<span
				className={menuIndicatorClassName}
				data-slot='tiptap-dropdown-menu-checkbox-item-indicator'
			>
				<MenuPrimitive.CheckboxItemIndicator>
					<CheckIcon />
				</MenuPrimitive.CheckboxItemIndicator>
			</span>
			{children}
		</MenuPrimitive.CheckboxItem>
	)
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
	return (
		<MenuPrimitive.RadioGroup
			data-slot='tiptap-dropdown-menu-radio-group'
			{...props}
		/>
	)
}

function DropdownMenuRadioItem({
	className,
	children,
	inset,
	...props
}: MenuPrimitive.RadioItem.Props & {
	inset?: boolean
}) {
	return (
		<MenuPrimitive.RadioItem
			data-slot='tiptap-dropdown-menu-radio-item'
			data-inset={inset}
			className={cn(menuItemClassName, 'pl-8', className)}
			{...props}
		>
			<span
				className={menuIndicatorClassName}
				data-slot='tiptap-dropdown-menu-radio-item-indicator'
			>
				<MenuPrimitive.RadioItemIndicator>
					<CheckIcon />
				</MenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</MenuPrimitive.RadioItem>
	)
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean
}) {
	return (
		<MenuPrimitive.GroupLabel
			data-slot='tiptap-dropdown-menu-label'
			data-inset={inset}
			className={cn(
				'px-2 py-1.5 font-semibold text-[0.6875rem] text-muted-foreground uppercase tracking-[0.12em] data-[inset=true]:pl-8',
				className,
			)}
			{...props}
		/>
	)
}

function DropdownMenuSeparator({
	className,
	...props
}: MenuPrimitive.Separator.Props) {
	return (
		<MenuPrimitive.Separator
			data-slot='tiptap-dropdown-menu-separator'
			className={cn('-mx-1 my-1 h-px bg-border', className)}
			{...props}
		/>
	)
}

function DropdownMenuShortcut({
	className,
	...props
}: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot='tiptap-dropdown-menu-shortcut'
			className={cn(
				'ml-auto text-muted-foreground text-xs tracking-normal',
				className,
			)}
			{...props}
		/>
	)
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return (
		<MenuPrimitive.SubmenuRoot
			data-slot='tiptap-dropdown-menu-sub'
			{...props}
		/>
	)
}

function DropdownMenuSubTrigger({
	className,
	inset,
	onPointerDown,
	...props
}: MenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean
}) {
	return (
		<MenuPrimitive.SubmenuTrigger
			data-slot='tiptap-dropdown-menu-sub-trigger'
			data-inset={inset}
			className={cn(menuItemClassName, className)}
			onPointerDown={(event) => {
				event.stopPropagation()
				onPointerDown?.(event)
			}}
			{...props}
		/>
	)
}

function DropdownMenuSubContent({
	className,
	align = 'start',
	alignOffset = -3,
	side = 'inline-end',
	sideOffset = 0,
	...props
}: MenuPrimitive.Popup.Props &
	Pick<
		MenuPrimitive.Positioner.Props,
		'align' | 'alignOffset' | 'side' | 'sideOffset'
	>) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className='isolate z-50 outline-none'
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot='tiptap-dropdown-menu-sub-content'
					className={cn(menuContentClassName, className)}
					finalFocus={false}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	)
}

export type { MenuPrimitive as DropdownMenuPrimitive }

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
}
