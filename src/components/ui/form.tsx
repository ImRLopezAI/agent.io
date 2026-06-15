/** biome-ignore-all lint/suspicious/noExplicitAny: Any for the context */
'use client'

import * as React from 'react'
import {
	type FieldValues,
	FormProvider,
	type UseFormProps,
	type UseFormReturn,
	useForm,
} from 'react-hook-form'

import { FieldGroup } from './field'
import {
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
	type FormComponent,
	type FormComponentStatics,
	type FormProps,
} from './form-components'
import { Input } from './input'
import { Switch } from './switch'
import { Textarea } from './textarea'

interface CreateFormProps<
	TFieldValues extends FieldValues = FieldValues,
> extends UseFormProps<TFieldValues> {
	onSubmit: (data: TFieldValues, form: UseFormReturn<TFieldValues>) => void
}

function useCreateForm<TFieldValues extends FieldValues = FieldValues>(
	factory: () => CreateFormProps<TFieldValues>,
	deps: React.DependencyList = [],
) {
	const config = React.useMemo(factory, deps)

	const form = useForm<TFieldValues>({
		mode: 'onChange',
		...(config as UseFormProps<TFieldValues>),
	})

	const FormComponentImpl = React.useMemo(() => {
		const Component: FormComponent<TFieldValues> &
			FormComponentStatics<TFieldValues> = (({ children }) => {
			return (
				<CustomFormContext.Provider
					value={{
						...form,
						onSubmit: (data, _event) => config.onSubmit(data, form),
					}}
				>
					<FormProvider {...form}>{children(form)}</FormProvider>
				</CustomFormContext.Provider>
			)
		}) as FormComponent<TFieldValues> & FormComponentStatics<TFieldValues>

		Component.Field = FormField
		Component.Input = Input
		Component.Textarea = Textarea
		Component.Item = FormItem
		Component.Label = FormLabel
		Component.Control = FormControl
		Component.Description = FormDescription
		Component.Message = FormMessage
		Component.Submit = FormSubmit
		Component.Select = Select
		Component.Group = FieldGroup
		Component.Combo = ComboBox
		Component.DatePicker = DatePicker
		Component.Switch = Switch

		return Component
	}, [form, config.onSubmit])

	const submit = React.useCallback(
		() => form.handleSubmit((data) => config.onSubmit(data, form))(),
		[form, config.onSubmit],
	)

	const formWithSubmit = React.useMemo(
		() => Object.assign(form, { submit }),
		[form, submit],
	)

	return [FormComponentImpl, formWithSubmit] as const
}

export { useCreateForm }
