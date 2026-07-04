'use client'

import { cn } from 'cnfast'
import {
	OTPInput,
	OTPInputContext,
	type OTPInputProps as OTPInputPrimitiveProps,
} from 'input-otp'
import { MinusIcon } from 'lucide-react'
import * as React from 'react'

type InputOTPSharedProps = Omit<
	OTPInputPrimitiveProps,
	'children' | 'defaultValue' | 'onChange' | 'render' | 'value'
> & {
	containerClassName?: string
	defaultValue?: string
	onChange?: (value: string) => void
	value?: string
}

type InputOTPRenderProps = {
	children?: never
	render: Exclude<OTPInputPrimitiveProps['render'], undefined>
}

type InputOTPChildrenProps = {
	children: React.ReactNode
	render?: never
}

type InputOTPProps = InputOTPSharedProps &
	(InputOTPChildrenProps | InputOTPRenderProps)

const InputOTP = React.forwardRef<
	React.ElementRef<typeof OTPInput>,
	InputOTPProps
>(
	(
		{
			children,
			className,
			containerClassName,
			defaultValue,
			onChange: onValueChange,
			render,
			value: controlledValue,
			...props
		},
		ref,
	) => {
		const [uncontrolledValue, setUncontrolledValue] = React.useState(
			typeof defaultValue === 'string' ? defaultValue : '',
		)
		const value = controlledValue ?? uncontrolledValue
		const handleChange = React.useCallback(
			(nextValue: string) => {
				if (controlledValue === undefined) {
					setUncontrolledValue(nextValue)
				}

				onValueChange?.(nextValue)
			},
			[controlledValue, onValueChange],
		)
		const sharedProps = {
			ref,
			'data-slot': 'input-otp',
			containerClassName: cn(
				'cn-input-otp flex items-center has-disabled:opacity-50',
				containerClassName,
			),
			spellCheck: false,
			className: cn('disabled:cursor-not-allowed', className),
			value,
			onChange: handleChange,
			...props,
		}

		if (render) {
			return <OTPInput {...sharedProps} render={render} />
		}

		return <OTPInput {...sharedProps}>{children}</OTPInput>
	},
)

InputOTP.displayName = 'InputOTP'

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot='input-otp-group'
			className={cn(
				'flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40',
				className,
			)}
			{...props}
		/>
	)
}

function InputOTPSlot({
	index,
	className,
	...props
}: React.ComponentProps<'div'> & {
	index: number
}) {
	const inputOTPContext = React.useContext(OTPInputContext)
	const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

	return (
		<div
			data-slot='input-otp-slot'
			data-active={isActive}
			className={cn(
				'relative flex size-8 items-center justify-center border-input border-y border-r text-sm outline-none transition-all first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40',
				className,
			)}
			{...props}
		>
			{char}
			{hasFakeCaret && (
				<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
					<div className='h-4 w-px animate-caret-blink bg-foreground duration-1000' />
				</div>
			)}
		</div>
	)
}

function InputOTPSeparator({
	className,
	...props
}: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot='input-otp-separator'
			aria-hidden
			className={cn(
				"flex items-center [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<hr className='sr-only' />
			<MinusIcon />
		</span>
	)
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot }
