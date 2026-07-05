import { cva } from 'class-variance-authority'

export const buttonGroupVariants = cva('flex w-fit items-center', {
	variants: {
		orientation: {
			horizontal:
				'[&>[data-slot=tiptap-button]+[data-slot=tiptap-button]]:ml-0.5',
			vertical:
				'flex-col [&>[data-slot=tiptap-button]+[data-slot=tiptap-button]]:mt-0.5',
		},
	},
	defaultVariants: {
		orientation: 'horizontal',
	},
})
