/** biome-ignore-all lint/suspicious/noExplicitAny:  Any for the context */
'use client'

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { format, isValid, parseISO } from 'date-fns'
import { CalendarIcon, Loader2 } from 'lucide-react'
import * as React from 'react'
import {
	Controller,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	FormProvider,
	type SubmitHandler,
	type UseFormProps,
	type UseFormReturn,
	useForm,
	useFormContext,
	useFormState,
} from 'react-hook-form'
import { cn } from '#/lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import * as FormComboBox from './combobox'
import {
	Field,
	FieldDescription,
	FieldError,
	type FieldGroup,
	FieldLabel,
} from './field'
import type { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import * as FormSelect from './select'
import type { Switch } from './switch'
import type { Textarea } from './textarea'

// Props for the configuration of the Form component
interface CreateFormProps<TFieldValues extends FieldValues = FieldValues>
	extends UseFormProps<TFieldValues> {
	onSubmit: (data: TFieldValues, form: UseFormReturn<TFieldValues>) => void
}

// Props for the actual rendered Form component
interface FormProps<TFieldValues extends FieldValues = FieldValues>
	extends Omit<React.ComponentProps<'div'>, 'children'> {
	// The render prop will now receive the form instance
	children: (form: UseFormReturn<TFieldValues>) => React.ReactNode
}

interface CustomFormContextValue<TFieldValues extends FieldValues = FieldValues>
	extends UseFormReturn<TFieldValues> {
	onSubmit: SubmitHandler<TFieldValues>
}

const CustomFormContext = React.createContext<
	CustomFormContextValue<any> | undefined
>(undefined)

function useCustomFormContext<
	TFieldValues extends FieldValues = FieldValues,
>(): CustomFormContextValue<TFieldValues> {
	const context = React.useContext(CustomFormContext)
	if (!context) {
		throw new Error('useCustomFormContext must be used within a Form component')
	}
	return context
}

interface SelectComponentStatics {
	Trigger: typeof FormSelect.SelectTrigger
	Value: typeof FormSelect.SelectValue
	Content: typeof FormSelect.SelectContent
	Item: typeof FormSelect.SelectItem
	Group: typeof FormSelect.SelectGroup
	Label: typeof FormSelect.SelectLabel
	Separator: typeof FormSelect.SelectSeparator
	ScrollUpButton: typeof FormSelect.SelectScrollUpButton
	ScrollDownButton: typeof FormSelect.SelectScrollDownButton
}

const Select = Object.assign(FormSelect.Select, {
	Trigger: FormSelect.SelectTrigger,
	Value: FormSelect.SelectValue,
	Content: FormSelect.SelectContent,
	Item: FormSelect.SelectItem,
	Group: FormSelect.SelectGroup,
	Label: FormSelect.SelectLabel,
	Separator: FormSelect.SelectSeparator,
	ScrollUpButton: FormSelect.SelectScrollUpButton,
	ScrollDownButton: FormSelect.SelectScrollDownButton,
} as SelectComponentStatics) as typeof FormSelect.Select &
	SelectComponentStatics

interface ComboboxComponentStatics {
	Input: typeof FormComboBox.ComboboxInput
	Content: typeof FormComboBox.ComboboxContent
	List: typeof FormComboBox.ComboboxList
	Item: typeof FormComboBox.ComboboxItem
	Group: typeof FormComboBox.ComboboxGroup
	Label: typeof FormComboBox.ComboboxLabel
	Collection: typeof FormComboBox.ComboboxCollection
	Empty: typeof FormComboBox.ComboboxEmpty
	Separator: typeof FormComboBox.ComboboxSeparator
	Chips: typeof FormComboBox.ComboboxChips
	Chip: typeof FormComboBox.ComboboxChip
	ChipsInput: typeof FormComboBox.ComboboxChipsInput
	Trigger: typeof FormComboBox.ComboboxTrigger
	Value: typeof FormComboBox.ComboboxValue
	useAnchor: typeof FormComboBox.useComboboxAnchor
}

const ComboBox = Object.assign(FormComboBox.Combobox, {
	Input: FormComboBox.ComboboxInput,
	Content: FormComboBox.ComboboxContent,
	List: FormComboBox.ComboboxList,
	Item: FormComboBox.ComboboxItem,
	Group: FormComboBox.ComboboxGroup,
	Label: FormComboBox.ComboboxLabel,
	Collection: FormComboBox.ComboboxCollection,
	Empty: FormComboBox.ComboboxEmpty,
	Separator: FormComboBox.ComboboxSeparator,
	Chips: FormComboBox.ComboboxChips,
	Chip: FormComboBox.ComboboxChip,
	ChipsInput: FormComboBox.ComboboxChipsInput,
	Trigger: FormComboBox.ComboboxTrigger,
	Value: FormComboBox.ComboboxValue,
	useAnchor: FormComboBox.useComboboxAnchor,
} as ComboboxComponentStatics) as typeof FormComboBox.Combobox &
	ComboboxComponentStatics

type FormComponent<TFieldValues extends FieldValues> = (
	props: FormProps<TFieldValues>,
) => React.ReactElement | null

type FormComponentStatics<TFieldValues extends FieldValues> = {
	Field: <TName extends FieldPath<TFieldValues>>(
		props: ControllerProps<TFieldValues, TName>,
	) => React.ReactElement | null
	Item: typeof FormItem
	Label: typeof FormLabel
	Control: typeof FormControl
	Description: typeof FormDescription
	Message: typeof FormMessage
	Submit: typeof FormSubmit
	Input: typeof Input
	Textarea: typeof Textarea
	Select: typeof Select
	Group: typeof FieldGroup
	Combo: typeof ComboBox
	DatePicker: typeof DatePicker
	Switch: typeof Switch
}

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
	{} as FormFieldContextValue,
)

function FormField<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ render, ...props }: ControllerProps<TFieldValues, TName>) {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} render={render} />
		</FormFieldContext.Provider>
	)
}

// FormItem component
type FormItemContextValue = {
	id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
	{} as FormItemContextValue,
)

function FormItem({ className, ...props }: React.ComponentProps<typeof Field>) {
	const id = React.useId()

	return (
		<FormItemContext.Provider value={{ id }}>
			<Field
				data-slot='form-item'
				className={cn('grid h-fit gap-2', className)}
				{...props}
			/>
		</FormItemContext.Provider>
	)
}

function FormLabel({
	className,
	...props
}: React.ComponentProps<typeof FieldLabel>) {
	const { error, formItemId } = useFormField()

	return (
		<FieldLabel
			data-slot='form-label'
			data-error={!!error}
			className={cn('data-[error=true]:text-destructive', className)}
			htmlFor={formItemId}
			id={`${formItemId}-label`}
			{...props}
		/>
	)
}

const toControlledProps = <T extends Record<string, unknown>>(props: T) => {
	const target = { ...props }
	const hasValue =
		Object.hasOwn(props, 'value') ||
		Object.hasOwn(props, 'defaultValue') ||
		Object.hasOwn(props, 'onChange')
	const hasChecked =
		Object.hasOwn(props, 'checked') ||
		Object.hasOwn(props, 'defaultChecked') ||
		Object.hasOwn(props, 'onCheckedChange')

	return new Proxy(target, {
		get(currentTarget, prop, receiver) {
			if (prop === 'value' && hasValue) {
				const value = Reflect.get(currentTarget, prop, receiver)
				if (value !== undefined && value !== null) {
					return value
				}
				const defaultValue = Reflect.get(
					currentTarget,
					'defaultValue',
					receiver,
				)
				if (defaultValue !== undefined && defaultValue !== null) {
					return defaultValue
				}
				const inputType = Reflect.get(currentTarget, 'type', receiver)
				if (inputType === 'number' || inputType === 'range') {
					return 0
				}
				return ''
			}
			if (prop === 'checked' && hasChecked) {
				const checked = Reflect.get(currentTarget, prop, receiver)
				if (checked !== undefined && checked !== null) {
					return checked
				}
				const defaultChecked = Reflect.get(
					currentTarget,
					'defaultChecked',
					receiver,
				)
				if (defaultChecked !== undefined && defaultChecked !== null) {
					return defaultChecked
				}
				return false
			}
			return Reflect.get(currentTarget, prop, receiver)
		},
		ownKeys(currentTarget) {
			const keys = Reflect.ownKeys(currentTarget)
			if (hasValue && !keys.includes('value')) {
				keys.push('value')
			}
			if (hasChecked && !keys.includes('checked')) {
				keys.push('checked')
			}
			return keys
		},
		getOwnPropertyDescriptor(currentTarget, prop) {
			if (
				prop === 'value' &&
				hasValue &&
				!Object.hasOwn(currentTarget, 'value')
			) {
				return {
					configurable: true,
					enumerable: true,
					writable: true,
					value: undefined,
				}
			}
			if (
				prop === 'checked' &&
				hasChecked &&
				!Object.hasOwn(currentTarget, 'checked')
			) {
				return {
					configurable: true,
					enumerable: true,
					writable: true,
					value: undefined,
				}
			}
			return Reflect.getOwnPropertyDescriptor(currentTarget, prop)
		},
	}) as T
}

interface FormControlProps extends useRender.ComponentProps<'div'> {}
function FormControl({ render, children, ...props }: FormControlProps) {
	const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
	const safeProps = toControlledProps(props)
	const renderElement = React.isValidElement(render)
		? React.cloneElement(
				render,
				toControlledProps(render.props as Record<string, unknown>),
			)
		: (render ??
			(React.isValidElement(children)
				? React.cloneElement(
						children,
						toControlledProps(children.props as Record<string, unknown>),
					)
				: undefined))

	return useRender({
		defaultTagName: 'div',
		render: renderElement,
		props: mergeProps<'div'>(
			{
				id: formItemId,
				'aria-describedby': !error
					? `${formDescriptionId}`
					: `${formDescriptionId} ${formMessageId}`,
				'aria-invalid': !!error,
			},
			safeProps,
		),
	})
}

function FormDescription({
	className,
	...props
}: React.ComponentProps<typeof FieldDescription>) {
	const { formDescriptionId } = useFormField()

	return (
		<FieldDescription
			data-slot='form-description'
			id={formDescriptionId}
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	)
}

function FormMessage({
	className,
	...props
}: React.ComponentProps<typeof FieldError>) {
	const { error, formMessageId } = useFormField()
	const body = error ? String(error?.message ?? '') : props.children

	if (!body) {
		return null
	}

	return (
		<FieldError data-slot='form-message' id={formMessageId} {...props}>
			{body}
		</FieldError>
	)
}

interface FormSubmitProps<TFieldValues extends FieldValues = FieldValues>
	extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
	onClick?: (data: TFieldValues, form: UseFormReturn<TFieldValues>) => void
	loadingState?: React.ReactNode
	disableOnInvalid?: boolean
}

function FormSubmit<TFieldValues extends FieldValues = FieldValues>({
	className,
	children,
	onClick,
	disableOnInvalid = true,
	loadingState,
	...props
}: FormSubmitProps<TFieldValues>) {
	const form = useCustomFormContext<TFieldValues>()
	const handleClick = onClick
		? () => form.handleSubmit((data) => onClick(data, form))()
		: () => form.handleSubmit((data) => form.onSubmit(data))()

	return (
		<Button
			className={cn(
				'rounded bg-primary px-4 py-2 text-primary-foreground',
				className,
			)}
			onClick={handleClick}
			{...props}
			disabled={
				form.formState.isSubmitting ||
				props.disabled ||
				(disableOnInvalid && !form.formState.isValid)
			}
		>
			{form.formState.isSubmitting
				? (loadingState ?? (
						<>
							<Loader2 className='mr-2 h-4 w-4 motion-safe:animate-spin' />
							Saving\u2026
						</>
					))
				: children}
		</Button>
	)
}

type DatePickerProps = Omit<
	React.ComponentProps<typeof Calendar>,
	'onSelect' | 'selected' | 'mode'
> & {
	placeholder?: string
	value: Date | string
	onValueChange: (date: Date | undefined) => void
}

function DatePicker({ placeholder, value, onValueChange }: DatePickerProps) {
	const [open, setOpen] = React.useState(false)
	const parsedDate = value
		? typeof value === 'string'
			? parseISO(value)
			: new Date(value)
		: null
	const isValidDate = parsedDate !== null && isValid(parsedDate)
	return (
		<Popover modal={false} open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant='outline'
						className={cn(
							'w-full justify-start text-left font-normal',
							!isValidDate && 'text-muted-foreground',
						)}
					>
						<CalendarIcon className='mr-2 h-4 w-4' />
						{isValidDate
							? format(parsedDate, 'PP p')
							: placeholder || 'Select date'}
					</Button>
				}
			/>
			<PopoverContent className='w-auto p-4' align='start'>
				<Calendar
					mode='single'
					{...(isValidDate && { selected: parsedDate })}
					onSelect={(date) => {
						onValueChange(date)
						setOpen(false)
					}}
				/>
			</PopoverContent>
		</Popover>
	)
}

// useFormField hook remains the same
const useFormField = () => {
	const fieldContext = React.useContext(FormFieldContext)
	const itemContext = React.useContext(FormItemContext)
	const { getFieldState } = useFormContext()
	const formState = useFormState({ name: fieldContext.name })
	const fieldState = getFieldState(fieldContext.name, formState)

	if (!fieldContext) {
		throw new Error('useFormField should be used within <FormField>')
	}

	const { id } = itemContext

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		...fieldState,
	}
}

export type { FormComponent, FormComponentStatics, FormProps }
export {
	ComboBox,
	CustomFormContext,
	DatePicker,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormSubmit,
	Select,
	useCustomFormContext,
}
