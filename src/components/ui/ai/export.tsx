import { FileDown } from 'lucide-react'
import { type ComponentProps, useTransition } from 'react'
import { Button } from '../button'

type ExportProps = Omit<
	ComponentProps<typeof Button>,
	'onClick' | 'disabled'
> & {
	documentType: 'pdf' | 'docx'
	title: string
	content: string
}
export function Export({ documentType, title, content, render }: ExportProps) {
	const [isPending, startTransition] = useTransition()
	const handleExport = async () => {
		try {
			const response = await fetch('/api/documents', {
				method: 'POST',
				body: JSON.stringify({ type: document, data: { title, content } }),
				headers: {
					'Content-Type': 'application/json',
				},
			})

			if (!response.ok) {
				console.error('Failed to export document', await response.json())
				return
			}

			// Get blob from response
			const blob = await response.blob()
			const url = window.URL.createObjectURL(blob)

			// Create a link and click it
			const link = window.document.createElement('a')
			link.href = url
			link.download = `${title}.${document}`
			window.document.body.appendChild(link)
			link.click()

			// Cleanup
			link.remove()
			window.URL.revokeObjectURL(url)
		} catch (error) {
			console.error('Error exporting document:', error)
		}
	}

	return (
		<Button
			variant='outline'
			size='sm'
			onClick={() => startTransition(handleExport)}
			disabled={isPending}
			render={
				render ?? (
					<>
						<FileDown className='mr-2 h-4 w-4' />
						{documentType.toUpperCase()}
					</>
				)
			}
		/>
	)
}
