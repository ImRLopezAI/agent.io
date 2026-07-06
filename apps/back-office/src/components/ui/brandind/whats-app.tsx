import { cn } from 'cnfast'
import type { SVGProps } from 'react'

type WhatsAppProps = Omit<SVGProps<SVGSVGElement>, 'title'> & {
	title?: string
}

export function WhatsApp({
	className,
	title = 'WhatsApp',
	...props
}: WhatsAppProps) {
	return (
		<svg viewBox='0 0 24 24' className={cn('size-4', className)} {...props}>
			<title>{title}</title>
			<path d='m17.5 14.4-2-1q-.4-.1-.7.2l-1 1.1q-.2.3-.6.1-.6 0-2.4-1.5l-1.7-2q-.1-.4.2-.6l.4-.6q.2-.2.3-.5v-.5L9 7q-.3-.7-.6-.5h-.6a1 1 0 0 0-.8.4c-.2.3-1 1-1 2.5 0 1.4 1 2.8 1.2 3s2.1 3.2 5.1 4.5l1.7.6a4 4 0 0 0 1.9.2c.5-.1 1.7-.8 2-1.5q.3-1 .1-1.4zM12 21.8a10 10 0 0 1-5-1.4l-.3-.2-3.8 1 1-3.7-.2-.3a10 10 0 0 1-1.5-5.3 9.9 9.9 0 0 1 16.8-7 10 10 0 0 1 3 7c0 5.5-4.5 9.9-10 9.9m8.5-18.3A12 12 0 0 0 12 0 12 12 0 0 0 1.7 17.8L.1 24l6.3-1.7a12 12 0 0 0 5.6 1.5 12 12 0 0 0 12-11.9 12 12 0 0 0-3.5-8.4' />
		</svg>
	)
}
