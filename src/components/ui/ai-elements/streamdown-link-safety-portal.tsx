'use client'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from '@ui/alert-dialog'
import { Button } from '@ui/button'
import { CheckIcon, CopyIcon, ExternalLinkIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	defaultTranslations,
	type LinkSafetyConfig,
	type LinkSafetyModalProps,
} from 'streamdown'
import { cn } from '#/lib/utils'

function StreamdownLinkSafetyModalContent({
	isOpen,
	onClose,
	onConfirm,
	url,
}: LinkSafetyModalProps) {
	const t = defaultTranslations
	const [copied, setCopied] = useState(false)
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	)

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
		} catch {
			/* clipboard unavailable */
		}
	}, [url])

	const handleConfirm = useCallback(() => {
		onConfirm()
		onClose()
	}, [onConfirm, onClose])

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current !== undefined) {
				clearTimeout(copyTimeoutRef.current)
			}
		}
	}, [])

	const clearCopyTimeout = useCallback(() => {
		if (copyTimeoutRef.current !== undefined) {
			clearTimeout(copyTimeoutRef.current)
		}
	}, [])

	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!open) {
					clearCopyTimeout()
					onClose()
				}
			}}
			open={isOpen}
		>
			<AlertDialogContent
				className='w-[min(calc(100vw-2rem),28rem)] max-w-md gap-0 overflow-hidden p-0'
				data-streamdown='link-safety-modal'
				size='default'
			>
				<div className='relative space-y-4 px-6 pt-6 pb-4'>
					<AlertDialogCancel
						aria-label={t.close}
						className='absolute top-3 right-3 z-10'
						size='icon-sm'
						variant='ghost'
					>
						<XIcon className='size-4' />
					</AlertDialogCancel>
					<AlertDialogHeader className='flex w-full flex-col gap-3 text-left'>
						<div className='flex w-full items-start gap-3 pr-8'>
							<AlertDialogMedia className='mb-0 shrink-0'>
								<ExternalLinkIcon className='size-6' />
							</AlertDialogMedia>
							<div className='min-w-0 flex-1 space-y-1.5'>
								<AlertDialogTitle className='font-semibold text-lg'>
									{t.openExternalLink}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{t.externalLinkWarning}
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>
					<div
						className={cn(
							'w-full break-all rounded-lg border border-border/60 bg-muted px-4 py-3 font-mono text-sm leading-relaxed',
							url.length > 100 && 'max-h-40 overflow-y-auto',
						)}
					>
						{url}
					</div>
				</div>
				<AlertDialogFooter className='mx-0 mb-0 gap-2 border-t px-6 py-4 sm:grid sm:grid-cols-2 sm:justify-stretch'>
					<Button
						className='w-full'
						onClick={handleCopy}
						type='button'
						variant='outline'
					>
						{copied ? (
							<>
								<CheckIcon className='size-3.5' />
								{t.copied}
							</>
						) : (
							<>
								<CopyIcon className='size-3.5' />
								{t.copyLink}
							</>
						)}
					</Button>
					<AlertDialogAction
						className='w-full'
						onClick={handleConfirm}
						type='button'
					>
						<ExternalLinkIcon className='size-3.5' />
						{t.openLink}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export function streamdownLinkSafetyPortalModal(props: LinkSafetyModalProps) {
	if (!props.isOpen) return null
	return <StreamdownLinkSafetyModalContent {...props} />
}

export function withDefaultPortaledLinkSafety(
	user?: LinkSafetyConfig,
): LinkSafetyConfig | undefined {
	if (user?.enabled === false) {
		return user
	}
	return {
		enabled: user?.enabled ?? true,
		onLinkCheck: user?.onLinkCheck,
		renderModal: user?.renderModal ?? streamdownLinkSafetyPortalModal,
	}
}
