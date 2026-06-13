'use client'

import { Button } from './ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from './ui/dialog'
import * as React from 'react'
import { cn } from '#/lib/utils'
import { useDataGridActions } from './contexts/data-grid-actions-context'
import { useAsRef } from './hooks/use-as-ref'
import type { PasteDialogState } from './types/data-grid'

interface DataGridPasteDialogProps {
	pasteDialog: PasteDialogState
}

export function DataGridPasteDialog({ pasteDialog }: DataGridPasteDialogProps) {
	const actions = useDataGridActions()

	if (!pasteDialog.open) return null

	return (
		<PasteDialog
			pasteDialog={pasteDialog}
			onPasteDialogOpenChange={actions.onPasteDialogOpenChange}
			onCellsPaste={actions.onCellsPaste}
		/>
	)
}

interface PasteDialogProps {
	pasteDialog: PasteDialogState
	onPasteDialogOpenChange: (open: boolean) => void
	onCellsPaste: (expand?: boolean) => void
}

const PasteDialog = React.memo(PasteDialogImpl, (prev, next) => {
	if (prev.pasteDialog.open !== next.pasteDialog.open) return false
	if (!next.pasteDialog.open) return true
	if (prev.pasteDialog.rowsNeeded !== next.pasteDialog.rowsNeeded) return false

	return true
})

function PasteDialogImpl({
	pasteDialog,
	onPasteDialogOpenChange,
	onCellsPaste,
}: PasteDialogProps) {
	const propsRef = useAsRef({
		onPasteDialogOpenChange,
		onCellsPaste,
	})

	const expandId = React.useId()
	const keepId = React.useId()
	const expandRadioRef = React.useRef<HTMLInputElement | null>(null)

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			propsRef.current.onPasteDialogOpenChange(open)
		},
		[propsRef],
	)

	const onCancel = React.useCallback(() => {
		propsRef.current.onPasteDialogOpenChange(false)
	}, [propsRef])

	const onContinue = React.useCallback(() => {
		propsRef.current.onCellsPaste(expandRadioRef.current?.checked ?? false)
	}, [propsRef])

	return (
		<Dialog open={pasteDialog.open} onOpenChange={onOpenChange}>
			<DialogContent data-grid-popover=''>
				<DialogHeader>
					<DialogTitle>Do you want to add more rows?</DialogTitle>
					<DialogDescription>
						We need <strong>{pasteDialog.rowsNeeded}</strong> additional row
						{pasteDialog.rowsNeeded !== 1 ? 's' : ''} to paste everything from
						your clipboard.
					</DialogDescription>
				</DialogHeader>
				<div className='flex flex-col gap-3 py-1'>
					<label
						htmlFor={expandId}
						className='flex cursor-pointer items-start gap-3'
					>
						<RadioItem
							id={expandId}
							ref={expandRadioRef}
							name='expand-option'
							value='expand'
							defaultChecked
						/>
						<div className='flex flex-col gap-1'>
							<span className='font-medium text-sm leading-none'>
								Create new rows
							</span>
							<span className='text-muted-foreground text-sm'>
								Add {pasteDialog.rowsNeeded} new row
								{pasteDialog.rowsNeeded !== 1 ? 's' : ''} to the table and paste
								all data
							</span>
						</div>
					</label>
					<label
						htmlFor={keepId}
						className='flex cursor-pointer items-start gap-3'
					>
						<RadioItem id={keepId} name='expand-option' value='no-expand' />
						<div className='flex flex-col gap-1'>
							<span className='font-medium text-sm leading-none'>
								Keep current rows
							</span>
							<span className='text-muted-foreground text-sm'>
								Paste only what fits in the existing rows
							</span>
						</div>
					</label>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={onContinue}>Continue</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

const RadioItem = React.forwardRef<
	HTMLInputElement,
	React.ComponentProps<'input'>
>(({ className, ...props }, ref) => {
	return (
		<input
			ref={ref}
			type='radio'
			className={cn(
				'relative size-4 shrink-0 appearance-none rounded-full border border-input bg-background shadow-xs outline-none transition-[color,box-shadow]',
				'text-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'disabled:cursor-not-allowed disabled:opacity-50',
				"checked:before:absolute checked:before:start-1/2 checked:before:top-1/2 checked:before:size-2 checked:before:-translate-x-1/2 checked:before:-translate-y-1/2 checked:before:rounded-full checked:before:bg-primary checked:before:content-['']",
				'dark:bg-input/30',
				className,
			)}
			{...props}
		/>
	)
})

RadioItem.displayName = 'RadioItem'
