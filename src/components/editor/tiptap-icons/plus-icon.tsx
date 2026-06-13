import { memo } from 'react'

type SvgProps = React.ComponentPropsWithoutRef<'svg'>

export const PlusIcon = memo(({ className, ...props }: SvgProps) => {
	return (
		<svg
			width='24'
			height='24'
			className={className}
			viewBox='0 0 24 24'
			fill='none'
			xmlns='http://www.w3.org/2000/svg'
			{...props}
		>
			<path
				d='M12 5V19M5 12H19'
				stroke='currentColor'
				strokeWidth='2'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	)
})

PlusIcon.displayName = 'PlusIcon'
