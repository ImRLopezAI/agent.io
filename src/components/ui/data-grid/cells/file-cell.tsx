'use client'

import { Upload, X } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { cn } from '#/lib/utils'

import { useDataGridActions } from '../contexts/data-grid-actions-context'
import { DataGridCellWrapper } from '../data-grid-cell-wrapper'
import { useBadgeOverflow } from '../hooks/use-badge-overflow'
import {
	formatFileSize,
	getCellKey,
	getFileIcon,
	getLineCount,
} from '../lib/data-grid'
import { generateId } from '../lib/id'
import type { DataGridCellProps, FileCellData } from '../types/data-grid'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Skeleton } from '../ui/skeleton'

export function FileCell<TData>({
	cell,
	rowIndex,
	columnId,
	rowHeight,
	isFocused,
	isEditing,
	isSelected,
	isSearchMatch,
	isActiveSearchMatch,
	readOnly,
	tableVariant,
}: DataGridCellProps<TData, 'file'>) {
	const actions = useDataGridActions()
	const cellValue = React.useMemo(() => cell.getValue() ?? [], [cell])

	const cellKey = getCellKey(rowIndex, columnId)
	const prevCellKeyRef = React.useRef(cellKey)

	const labelId = React.useId()
	const descriptionId = React.useId()

	const [files, setFiles] = React.useState<FileCellData[]>(cellValue)
	const [uploadingFiles, setUploadingFiles] = React.useState<Set<string>>(
		new Set(),
	)
	const [deletingFiles, setDeletingFiles] = React.useState<Set<string>>(
		new Set(),
	)
	const [isDraggingOver, setIsDraggingOver] = React.useState(false)
	const [isDragging, setIsDragging] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	const isUploading = uploadingFiles.size > 0
	const isDeleting = deletingFiles.size > 0
	const isPending = isUploading || isDeleting
	const containerRef = React.useRef<HTMLDivElement>(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const dropzoneRef = React.useRef<HTMLDivElement>(null)
	const cellOpts = cell.column.columnDef.meta?.cell
	const sideOffset = -(containerRef.current?.clientHeight ?? 0)

	const fileCellOpts = cellOpts?.variant === 'file' ? cellOpts : null
	const maxFileSize = fileCellOpts?.maxFileSize ?? 10 * 1024 * 1024
	const maxFiles = fileCellOpts?.maxFiles ?? 10
	const accept = fileCellOpts?.accept
	const multiple = fileCellOpts?.multiple ?? false

	const acceptedTypes = React.useMemo(
		() => (accept ? accept.split(',').map((t) => t.trim()) : null),
		[accept],
	)

	const prevCellValueRef = React.useRef(cellValue)
	if (cellValue !== prevCellValueRef.current) {
		prevCellValueRef.current = cellValue
		for (const file of files) {
			if (file.url) {
				URL.revokeObjectURL(file.url)
			}
		}
		setFiles(cellValue)
		setError(null)
	}

	if (prevCellKeyRef.current !== cellKey) {
		prevCellKeyRef.current = cellKey
		setError(null)
	}

	const validateFile = React.useCallback(
		(file: File): string | null => {
			if (maxFileSize && file.size > maxFileSize) {
				return `File size exceeds ${formatFileSize(maxFileSize)}`
			}
			if (acceptedTypes) {
				const fileExtension = `.${file.name.split('.').pop()}`
				const isAccepted = acceptedTypes.some((type) => {
					if (type.endsWith('/*')) {
						const baseType = type.slice(0, -2)
						return file.type.startsWith(`${baseType}/`)
					}
					if (type.startsWith('.')) {
						return fileExtension.toLowerCase() === type.toLowerCase()
					}
					return file.type === type
				})
				if (!isAccepted) {
					return 'File type not accepted'
				}
			}
			return null
		},
		[maxFileSize, acceptedTypes],
	)

	const addFiles = React.useCallback(
		async (newFiles: File[], skipUpload = false) => {
			if (readOnly || isPending) return
			setError(null)

			if (maxFiles && files.length + newFiles.length > maxFiles) {
				const errorMessage = `Maximum ${maxFiles} files allowed`
				setError(errorMessage)
				toast(errorMessage)
				setTimeout(() => {
					setError(null)
				}, 2000)
				return
			}

			const rejectedFiles: Array<{ name: string; reason: string }> = []
			const filesToValidate: File[] = []

			for (const file of newFiles) {
				const validationError = validateFile(file)
				if (validationError) {
					rejectedFiles.push({ name: file.name, reason: validationError })
					continue
				}
				filesToValidate.push(file)
			}

			if (rejectedFiles.length > 0) {
				const firstError = rejectedFiles[0]
				if (firstError) {
					setError(firstError.reason)

					const truncatedName =
						firstError.name.length > 20
							? `${firstError.name.slice(0, 20)}...`
							: firstError.name

					if (rejectedFiles.length === 1) {
						toast(firstError.reason, {
							description: `"${truncatedName}" has been rejected`,
						})
					} else {
						toast(firstError.reason, {
							description: `"${truncatedName}" and ${rejectedFiles.length - 1} more rejected`,
						})
					}

					setTimeout(() => {
						setError(null)
					}, 2000)
				}
			}

			if (filesToValidate.length > 0) {
				if (!skipUpload) {
					const tempFiles = filesToValidate.map((f) => ({
						id: generateId('file'),
						name: f.name,
						size: f.size,
						type: f.type,
						url: undefined,
					}))
					const filesWithTemp = [...files, ...tempFiles]
					setFiles(filesWithTemp)

					const uploadingIds = new Set<string>(tempFiles.map((f) => f.id))
					setUploadingFiles(uploadingIds)

					let uploadedFiles: FileCellData[] = []

					if (actions.onFilesUpload) {
						try {
							uploadedFiles = await actions.onFilesUpload({
								files: filesToValidate,
								rowIndex,
								columnId,
							})
						} catch (error) {
							toast.error(
								error instanceof Error
									? error.message
									: `Failed to upload ${filesToValidate.length} file${filesToValidate.length !== 1 ? 's' : ''}`,
							)
							setFiles((prev) => prev.filter((f) => !uploadingIds.has(f.id)))
							setUploadingFiles(new Set())
							return
						}
					} else {
						uploadedFiles = filesToValidate.map((f, i) => ({
							id: tempFiles[i]?.id ?? generateId('file'),
							name: f.name,
							size: f.size,
							type: f.type,
							url: URL.createObjectURL(f),
						}))
					}

					const finalFiles = filesWithTemp
						.map((f) => {
							if (uploadingIds.has(f.id)) {
								return uploadedFiles.find((uf) => uf.name === f.name) ?? f
							}
							return f
						})
						.filter((f) => f.url !== undefined)

					setFiles(finalFiles)
					setUploadingFiles(new Set())
					actions.onDataUpdate({ rowIndex, columnId, value: finalFiles })
				} else {
					const newFilesData: FileCellData[] = filesToValidate.map((f) => ({
						id: generateId('file'),
						name: f.name,
						size: f.size,
						type: f.type,
						url: URL.createObjectURL(f),
					}))
					const updatedFiles = [...files, ...newFilesData]
					setFiles(updatedFiles)
					actions.onDataUpdate({
						rowIndex,
						columnId,
						value: updatedFiles,
					})
				}
			}
		},
		[
			files,
			maxFiles,
			validateFile,
			actions,
			rowIndex,
			columnId,
			readOnly,
			isPending,
		],
	)

	const removeFile = React.useCallback(
		async (fileId: string) => {
			if (readOnly || isPending) return
			setError(null)

			const fileToRemove = files.find((f) => f.id === fileId)
			if (!fileToRemove) return

			setDeletingFiles((prev) => new Set(prev).add(fileId))

			if (actions.onFilesDelete) {
				try {
					await actions.onFilesDelete({
						fileIds: [fileId],
						rowIndex,
						columnId,
					})
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: `Failed to delete ${fileToRemove.name}`,
					)
					setDeletingFiles((prev) => {
						const next = new Set(prev)
						next.delete(fileId)
						return next
					})
					return
				}
			}

			if (fileToRemove.url?.startsWith('blob:')) {
				URL.revokeObjectURL(fileToRemove.url)
			}

			const updatedFiles = files.filter((f) => f.id !== fileId)
			setFiles(updatedFiles)
			setDeletingFiles((prev) => {
				const next = new Set(prev)
				next.delete(fileId)
				return next
			})
			actions.onDataUpdate({ rowIndex, columnId, value: updatedFiles })
		},
		[files, actions, rowIndex, columnId, readOnly, isPending],
	)

	const clearAll = React.useCallback(async () => {
		if (readOnly || isPending) return
		setError(null)

		const fileIds = files.map((f) => f.id)
		setDeletingFiles(new Set(fileIds))

		if (actions.onFilesDelete && files.length > 0) {
			try {
				await actions.onFilesDelete({
					fileIds,
					rowIndex,
					columnId,
				})
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Failed to delete files',
				)
				setDeletingFiles(new Set())
				return
			}
		}

		for (const file of files) {
			if (file.url?.startsWith('blob:')) {
				URL.revokeObjectURL(file.url)
			}
		}
		setFiles([])
		setDeletingFiles(new Set())
		actions.onDataUpdate({ rowIndex, columnId, value: [] })
	}, [files, actions, rowIndex, columnId, readOnly, isPending])

	const onCellDragEnter = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
		if (event.dataTransfer.types.includes('Files')) {
			setIsDraggingOver(true)
		}
	}, [])

	const onCellDragLeave = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
		const rect = event.currentTarget.getBoundingClientRect()
		const x = event.clientX
		const y = event.clientY

		if (
			x <= rect.left ||
			x >= rect.right ||
			y <= rect.top ||
			y >= rect.bottom
		) {
			setIsDraggingOver(false)
		}
	}, [])

	const onCellDragOver = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
	}, [])

	const onCellDrop = React.useCallback(
		(event: React.DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			setIsDraggingOver(false)

			const droppedFiles = Array.from(event.dataTransfer.files)
			if (droppedFiles.length > 0) {
				addFiles(droppedFiles, false)
			}
		},
		[addFiles],
	)

	const onDropzoneDragEnter = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
		setIsDragging(true)
	}, [])

	const onDropzoneDragLeave = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
		const rect = event.currentTarget.getBoundingClientRect()
		const x = event.clientX
		const y = event.clientY

		if (
			x <= rect.left ||
			x >= rect.right ||
			y <= rect.top ||
			y >= rect.bottom
		) {
			setIsDragging(false)
		}
	}, [])

	const onDropzoneDragOver = React.useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.stopPropagation()
	}, [])

	const onDropzoneDrop = React.useCallback(
		(event: React.DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			setIsDragging(false)

			const droppedFiles = Array.from(event.dataTransfer.files)
			addFiles(droppedFiles, false)
		},
		[addFiles],
	)

	const onDropzoneClick = React.useCallback(() => {
		fileInputRef.current?.click()
	}, [])

	const onDropzoneKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				onDropzoneClick()
			}
		},
		[onDropzoneClick],
	)

	const onFileInputChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const selectedFiles = Array.from(event.target.files ?? [])
			addFiles(selectedFiles, false)
			event.target.value = ''
		},
		[addFiles],
	)

	const onOpenChange = React.useCallback(
		(open: boolean) => {
			if (open && !readOnly) {
				setError(null)
				actions.onCellEditingStart(rowIndex, columnId)
			} else {
				setError(null)
				actions.onCellEditingStop()
			}
		},
		[actions, rowIndex, columnId, readOnly],
	)

	const onPopoverKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === 'Escape') {
				event.stopPropagation()
			}
		},
		[],
	)

	const onWrapperKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (isEditing) {
				if (event.key === 'Escape') {
					event.preventDefault()
					setFiles(cellValue)
					setError(null)
					actions.onCellEditingStop()
				} else if (event.key === ' ') {
					event.preventDefault()
					onDropzoneClick()
				} else if (event.key === 'Tab') {
					event.preventDefault()
					actions.onCellEditingStop({
						direction: event.shiftKey ? 'left' : 'right',
					})
				}
			} else if (isFocused && event.key === 'Enter') {
				event.preventDefault()
				actions.onCellEditingStart(rowIndex, columnId)
			} else if (isFocused && event.key === 'Tab') {
				event.preventDefault()
				actions.onCellEditingStop({
					direction: event.shiftKey ? 'left' : 'right',
				})
			}
		},
		[
			isEditing,
			isFocused,
			cellValue,
			actions,
			onDropzoneClick,
			rowIndex,
			columnId,
		],
	)

	React.useEffect(() => {
		return () => {
			for (const file of files) {
				if (file.url) {
					URL.revokeObjectURL(file.url)
				}
			}
		}
	}, [files])

	const lineCount = getLineCount(rowHeight)

	const { visibleItems: visibleFiles, hiddenCount: hiddenFileCount } =
		useBadgeOverflow({
			items: files,
			getLabel: (file) => file.name,
			containerRef,
			lineCount,
			cacheKeyPrefix: 'file',
			iconSize: 12,
			maxWidth: 100,
		})

	return (
		<DataGridCellWrapper<TData>
			ref={containerRef}
			cell={cell}
			rowIndex={rowIndex}
			columnId={columnId}
			rowHeight={rowHeight}
			tableVariant={tableVariant}
			isEditing={isEditing}
			isFocused={isFocused}
			isSelected={isSelected}
			isSearchMatch={isSearchMatch}
			isActiveSearchMatch={isActiveSearchMatch}
			readOnly={readOnly}
			className={cn({
				'ring-1 ring-primary/80 ring-inset': isDraggingOver,
			})}
			onDragEnter={onCellDragEnter}
			onDragLeave={onCellDragLeave}
			onDragOver={onCellDragOver}
			onDrop={onCellDrop}
			onKeyDown={onWrapperKeyDown}
		>
			{isEditing ? (
				<Popover open={isEditing} onOpenChange={onOpenChange}>
					<PopoverTrigger
						className='py-0'
						nativeButton={false}
						render={<div className='absolute inset-0' />}
					/>
					<PopoverContent
						data-grid-cell-editor=''
						align='start'
						sideOffset={sideOffset}
						className='w-[400px] rounded-none p-0'
						initialFocus={dropzoneRef}
						onKeyDown={onPopoverKeyDown}
					>
						<div className='flex flex-col gap-2 p-3'>
							<span id={labelId} className='sr-only'>
								File upload
							</span>
							<div
								role='region'
								aria-labelledby={labelId}
								aria-describedby={descriptionId}
								aria-invalid={!!error}
								aria-disabled={isPending}
								data-dragging={isDragging ? '' : undefined}
								data-invalid={error ? '' : undefined}
								data-disabled={isPending ? '' : undefined}
								tabIndex={isDragging || isPending ? -1 : 0}
								className='flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 outline-none transition-colors hover:bg-accent/30 focus-visible:border-ring/50 data-disabled:pointer-events-none data-dragging:border-primary/30 data-invalid:border-destructive data-dragging:bg-accent/30 data-disabled:opacity-50 data-invalid:ring-destructive/20'
								ref={dropzoneRef}
								onClick={onDropzoneClick}
								onDragEnter={onDropzoneDragEnter}
								onDragLeave={onDropzoneDragLeave}
								onDragOver={onDropzoneDragOver}
								onDrop={onDropzoneDrop}
								onKeyDown={onDropzoneKeyDown}
							>
								<Upload className='size-8 text-muted-foreground' />
								<div className='text-center text-sm'>
									<p className='font-medium'>
										{isDragging ? 'Drop files here' : 'Drag files here'}
									</p>
									<p className='text-muted-foreground text-xs'>
										or click to browse
									</p>
								</div>
								<p id={descriptionId} className='text-muted-foreground text-xs'>
									{maxFileSize
										? `Max size: ${formatFileSize(maxFileSize)}${maxFiles ? ` • Max ${maxFiles} files` : ''}`
										: maxFiles
											? `Max ${maxFiles} files`
											: 'Select files to upload'}
								</p>
							</div>
							<input
								type='file'
								aria-labelledby={labelId}
								aria-describedby={descriptionId}
								multiple={multiple}
								accept={accept}
								className='sr-only'
								ref={fileInputRef}
								onChange={onFileInputChange}
							/>
							{files.length > 0 && (
								<div className='flex flex-col gap-2'>
									<div className='flex items-center justify-between'>
										<p className='font-medium text-muted-foreground text-xs'>
											{files.length} {files.length === 1 ? 'file' : 'files'}
										</p>
										<Button
											type='button'
											variant='ghost'
											size='sm'
											className='h-6 text-muted-foreground text-xs'
											onClick={clearAll}
											disabled={isPending}
										>
											Clear all
										</Button>
									</div>
									<div className='max-h-[200px] space-y-1 overflow-y-auto'>
										{files.map((file) => {
											const FileIcon = getFileIcon(file.type)
											const isFileUploading = uploadingFiles.has(file.id)
											const isFileDeleting = deletingFiles.has(file.id)
											const isFilePending = isFileUploading || isFileDeleting

											return (
												<div
													key={file.id}
													data-pending={isFilePending ? '' : undefined}
													className='flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 data-pending:opacity-60'
												>
													{FileIcon && (
														<FileIcon className='size-4 shrink-0 text-muted-foreground' />
													)}
													<div className='flex-1 overflow-hidden'>
														<p className='truncate text-sm'>{file.name}</p>
														<p className='text-muted-foreground text-xs'>
															{isFileUploading
																? 'Uploading...'
																: isFileDeleting
																	? 'Deleting...'
																	: formatFileSize(file.size)}
														</p>
													</div>
													<Button
														type='button'
														variant='ghost'
														size='icon'
														className='size-5 rounded-sm'
														onClick={() => removeFile(file.id)}
														disabled={isPending}
													>
														<X className='size-3' />
													</Button>
												</div>
											)
										})}
									</div>
								</div>
							)}
						</div>
					</PopoverContent>
				</Popover>
			) : null}
			{isDraggingOver ? (
				<div className='flex items-center justify-center gap-2 text-primary text-sm'>
					<Upload className='size-4' />
					<span>Drop files here</span>
				</div>
			) : files.length > 0 ? (
				<div className='flex flex-wrap items-center gap-1 overflow-hidden'>
					{visibleFiles.map((file) => {
						const isUploading = uploadingFiles.has(file.id)

						if (isUploading) {
							return (
								<Skeleton
									key={file.id}
									className='h-5 shrink-0 px-1.5'
									style={{
										width: `${Math.min(file.name.length * 8 + 30, 100)}px`,
									}}
								/>
							)
						}

						const FileIcon = getFileIcon(file.type)

						return (
							<Badge
								key={file.id}
								variant='secondary'
								className='gap-1 px-1.5 py-px'
							>
								{FileIcon && <FileIcon className='size-3 shrink-0' />}
								<span className='max-w-[100px] truncate'>{file.name}</span>
							</Badge>
						)
					})}
					{hiddenFileCount > 0 && (
						<Badge
							variant='outline'
							className='px-1.5 py-px text-muted-foreground'
						>
							+{hiddenFileCount}
						</Badge>
					)}
				</div>
			) : null}
		</DataGridCellWrapper>
	)
}
