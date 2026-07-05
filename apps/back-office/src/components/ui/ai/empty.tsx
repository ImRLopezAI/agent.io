interface MiniCardProps {
	icon: React.ReactNode
	title: string
	description: string
}
export function MiniCards({ icon, title, description }: MiniCardProps) {
	return (
		<div className='cursor-pointer rounded-lg p-4 shadow-2xl transition-colors hover:bg-accent hover:text-accent-foreground'>
			{icon}
			<h4 className='font-medium text-sm'>{title}</h4>
			<p className='text-muted-foreground text-xs'>{description}</p>
		</div>
	)
}
