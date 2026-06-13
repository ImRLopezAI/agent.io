'use client'

import {
	ArrowUp,
	BookOpen,
	Check,
	ChevronDown,
	File,
	Globe,
	Image as ImageIcon,
	Layout,
	type LucideIcon,
	Mic,
	Paperclip,
	Plus,
	Sparkles,
	Square,
	Video,
	X,
} from 'lucide-react'
import { AnimatePresence, domMax, LazyMotion, m } from 'motion/react'
import type React from 'react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { cn } from '#/lib/utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type IconComponent = React.ComponentType<{ className?: string }>

interface AIInputContextType {
	activeDropdown: 'plus' | 'tools' | 'model' | null
	setActiveDropdown: (dropdown: 'plus' | 'tools' | 'model' | null) => void
}

interface Model {
	id: string
	name: string
	label: string
	icon: LucideIcon
}

interface MenuItem {
	id: string
	icon: LucideIcon
	label: string
}

interface ToolItem {
	icon: LucideIcon
	label: string
}

interface Attachment {
	preview: string
	type: 'image' | 'file' | 'video'
}

interface Message {
	id: string
	role: 'user' | 'ai'
	content: string
	attachments?: Attachment[]
}

interface UploadedFile {
	id: string
	file: File
	preview: string
	type: 'image' | 'file' | 'video'
}

// =============================================================================
// CONSTANTS & DEFAULTS
// =============================================================================

const DEFAULT_MODELS: Model[] = [
	{ id: 'gpt4o', name: 'GPT-4o', label: 'GPT-4o', icon: Sparkles },
	{ id: 'gpt4', name: 'GPT-4', label: 'GPT-4', icon: Sparkles },
	{ id: 'claude', name: 'Claude 3.5', label: 'Claude 3.5', icon: Sparkles },
	{
		id: 'claude-opus',
		name: 'Claude 4.5 Opus',
		label: 'Claude 4.5 Opus',
		icon: Sparkles,
	},
]

const DEFAULT_PLUS_MENU: MenuItem[] = [
	{ id: 'files', icon: Paperclip, label: 'Upload photos & files' },
	{ id: 'videos', icon: Video, label: 'Upload Videos' },
]

const DEFAULT_TOOLS: ToolItem[] = [
	{ icon: Globe, label: 'Deep Research' },
	{ icon: Video, label: 'Create videos' },
	{ icon: ImageIcon, label: 'Create images' },
	{ icon: Layout, label: 'Canvas' },
	{ icon: BookOpen, label: 'Guided Learning' },
]

// =============================================================================
// CONTEXT
// =============================================================================

const AIInputContext = createContext<AIInputContextType | undefined>(undefined)

export const useAIInput = () => {
	const context = useContext(AIInputContext)
	if (!context) {
		throw new Error('useAIInput must be used within an AIInput component')
	}
	return context
}

// =============================================================================
// DROPDOWN COMPONENT
// =============================================================================

interface DropdownItem {
	icon?: IconComponent
	label: string
	onClick?: () => void
}

interface AIInputDropdownProps<T> {
	isOpen: boolean
	onClose: () => void
	items: T[]
	renderItem?: (item: T, index: number) => React.ReactNode
	className?: string
}

export function AIInputDropdown<T extends DropdownItem>({
	isOpen,
	onClose,
	items,
	renderItem,
	className,
}: AIInputDropdownProps<T>) {
	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<button
						type='button'
						tabIndex={-1}
						aria-label='Dismiss'
						className='fixed inset-0 z-40 border-0 bg-transparent p-0'
						onClick={onClose}
						onKeyDown={(e) => {
							if (e.key === 'Escape') onClose()
						}}
					/>
					<m.div
						initial={{ opacity: 0, scale: 0.9, y: 10 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.9, y: 10 }}
						transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
						className={cn(
							'absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-2xl border border-black/5 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]',
							className,
						)}
					>
						<div className='flex flex-col gap-0.5'>
							{items.map((item, index) =>
								renderItem ? (
									<div key={item.label} role='presentation' onClick={onClose}>
										{renderItem(item, index)}
									</div>
								) : (
									<button
										key={item.label}
										onClick={() => {
											item.onClick?.()
											onClose()
										}}
										className='group flex w-full items-center gap-2 rounded-2xl px-2 py-2.5 text-left text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'
									>
										{item.icon && (
											<item.icon className='h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200' />
										)}
										<span className='font-medium text-sm'>{item.label}</span>
									</button>
								),
							)}
						</div>
					</m.div>
				</>
			)}
		</AnimatePresence>
	)
}
AIInputDropdown.displayName = 'AIInputDropdown'

// =============================================================================
// PILL BUTTON COMPONENT
// =============================================================================

interface AIInputPillButtonProps {
	children: React.ReactNode
	isActive?: boolean
	showChevron?: boolean
	chevronRotated?: boolean
	showClose?: boolean
	onClose?: () => void
	onClick?: () => void
	layoutId?: string
	className?: string
	icon?: IconComponent
}

export function AIInputPillButton({
	children,
	isActive = false,
	showChevron = false,
	chevronRotated = false,
	showClose = false,
	onClose,
	onClick,
	layoutId,
	className,
	icon: Icon,
}: AIInputPillButtonProps) {
	const baseStyles =
		'flex items-center gap-2 px-3 py-2 rounded-full transition-colors border cursor-pointer'
	const activeStyles =
		'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-black/10 dark:border-white/10'
	const inactiveStyles =
		'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-black/5 dark:border-white/5'

	const pillContent = (
		<>
			{Icon && <Icon className='h-4 w-4 text-zinc-500' />}
			{children}
			{showChevron && (
				<ChevronDown
					className={cn(
						'h-4 w-4 text-zinc-400 transition-transform',
						chevronRotated && 'rotate-180',
					)}
				/>
			)}
		</>
	)

	if (showClose) {
		return (
			<m.div
				layoutId={layoutId}
				layout
				transition={{ duration: 0.3 }}
				className={cn(
					baseStyles,
					isActive ? activeStyles : inactiveStyles,
					className,
				)}
			>
				<button
					onClick={onClick}
					className='flex cursor-pointer items-center gap-2'
				>
					{pillContent}
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation()
						onClose?.()
					}}
					className='ml-1 flex cursor-pointer items-center justify-center rounded-full bg-zinc-200 p-0.5 text-zinc-500 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600'
				>
					<X className='h-3 w-3' />
				</button>
			</m.div>
		)
	}

	return (
		<m.button
			layoutId={layoutId}
			layout
			onClick={onClick}
			transition={{ duration: 0.3 }}
			className={cn(
				baseStyles,
				isActive ? activeStyles : inactiveStyles,
				className,
			)}
		>
			{pillContent}
		</m.button>
	)
}
AIInputPillButton.displayName = 'AIInputPillButton'

// =============================================================================
// MESSAGES AREA COMPONENT
// =============================================================================

interface AIInputMessagesProps {
	messages: Message[]
	hasSubmitted: boolean
	messagesEndRef: React.RefObject<HTMLDivElement | null>
}

export function AIInputMessages({
	messages,
	hasSubmitted,
	messagesEndRef,
}: AIInputMessagesProps) {
	return (
		<m.div
			layout
			className={cn(
				'hide-scrollbar mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto px-4',
				hasSubmitted ? 'flex-1 pt-10' : 'hidden',
			)}
		>
			{hasSubmitted && (
				<>
					{messages.map((msg) => (
						<m.div
							initial={{ opacity: 0, y: 20, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							key={msg.id}
							className={cn(
								'flex max-w-[85%] flex-col gap-2',
								msg.role === 'user' ? 'ml-auto items-end' : 'items-start',
							)}
						>
							{msg.attachments && msg.attachments.length > 0 && (
								<div className='flex flex-wrap justify-end gap-2'>
									{msg.attachments.map((attachment, attachIdx) => (
										<div key={attachIdx} className='relative'>
											{attachment.type === 'image' ? (
												<div className='relative h-20 w-20 overflow-hidden rounded-[12px] border border-black/5 dark:border-white/10'>
													<img
														src={attachment.preview}
														alt='Attachment'
														className='absolute inset-0 size-full object-cover'
													/>
												</div>
											) : attachment.type === 'video' ? (
												<div className='relative h-32 w-32 overflow-hidden rounded-lg border border-black/5 bg-zinc-200 dark:border-white/10 dark:bg-zinc-700'>
													<video
														src={attachment.preview}
														className='h-full w-full object-cover'
													/>
												</div>
											) : (
												<div className='flex h-20 w-20 items-center justify-center rounded-lg border border-black/5 bg-zinc-100 dark:border-white/10 dark:bg-zinc-800'>
													<File className='h-8 w-8 text-zinc-500' />
												</div>
											)}
										</div>
									))}
								</div>
							)}
							{msg.content && (
								<div
									className={cn(
										'rounded-[12px] p-2',
										msg.role === 'user'
											? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
											: 'text-zinc-900 dark:text-zinc-100',
									)}
								>
									{msg.role === 'ai' && (
										<div className='mb-2 flex items-center gap-2 font-medium text-neutral-500 text-xs'>
											<Sparkles className='h-3 w-3' />
											AI Response
										</div>
									)}
									{msg.content}
								</div>
							)}
						</m.div>
					))}
					<div className='h-24 flex-shrink-0' />
					<div ref={messagesEndRef} />
				</>
			)}
		</m.div>
	)
}
AIInputMessages.displayName = 'AIInputMessages'

// =============================================================================
// FILE PREVIEW COMPONENT
// =============================================================================

interface AIInputFilePreviewProps {
	files: UploadedFile[]
	onRemove: (id: string) => void
}

export function AIInputFilePreview({
	files,
	onRemove,
}: AIInputFilePreviewProps) {
	return (
		<AnimatePresence>
			{files.length > 0 && (
				<m.div
					layout
					initial={{ opacity: 0, height: 0 }}
					animate={{
						opacity: 1,
						height: 'auto',
						transition: { ease: 'easeInOut' },
					}}
					exit={{
						opacity: 0,
						height: 0,
						transition: { duration: 0.2, ease: 'easeInOut' },
					}}
					className='overflow-hidden'
				>
					<div className='flex flex-wrap gap-2 px-4 pt-4 pb-2'>
						{files.map((file) => (
							<m.div
								key={file.id}
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.8 }}
								layout
								className='group/file relative'
							>
								{file.type === 'image' ? (
									<div className='relative h-16 w-16 overflow-hidden rounded-[12px] border border-black/5 dark:border-white/10'>
										<img
											src={file.preview}
											alt={file.file.name}
											className='absolute inset-0 size-full object-cover'
										/>
									</div>
								) : file.type === 'video' ? (
									<div className='relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-zinc-100 dark:border-white/10 dark:bg-zinc-800'>
										<video
											src={file.preview}
											className='h-full w-full object-cover'
										/>
									</div>
								) : (
									<div className='flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-black/5 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800'>
										<File className='h-5 w-5 text-zinc-500' />
										<span className='w-full truncate text-center text-[8px] text-zinc-500'>
											{file.file.name.split('.').pop()?.toUpperCase()}
										</span>
									</div>
								)}
								<button
									onClick={() => onRemove(file.id)}
									className='absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-black/5 bg-zinc-100 text-zinc-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-400'
								>
									<X className='h-3 w-3' />
								</button>
							</m.div>
						))}
					</div>
				</m.div>
			)}
		</AnimatePresence>
	)
}
AIInputFilePreview.displayName = 'AIInputFilePreview'

// =============================================================================
// MAIN AI INPUT COMPONENT
// =============================================================================

interface AIInputProps {
	models?: Model[]
	tools?: ToolItem[]
	plusMenuItems?: MenuItem[]
	onSubmit?: (message: string, attachments: Attachment[]) => void
	placeholder?: string
	className?: string
}

export function AIInput({
	models = DEFAULT_MODELS,
	tools = DEFAULT_TOOLS,
	plusMenuItems = DEFAULT_PLUS_MENU,
	onSubmit,
	placeholder = 'Ask anything...',
	className,
}: AIInputProps) {
	const [value, setValue] = useState<string>('')
	const [messages, setMessages] = useState<Message[]>([])
	const [hasSubmitted, setHasSubmitted] = useState<boolean>(false)
	const [isListening, setIsListening] = useState<boolean>(false)
	const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null)
	const [selectedModel, setSelectedModel] = useState<Model>(models[0])
	const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
	const [activeDropdown, setActiveDropdown] = useState<
		'plus' | 'tools' | 'model' | null
	>(null)

	const fileInputRef = useRef<HTMLInputElement>(null)
	const videoInputRef = useRef<HTMLInputElement>(null)
	const messagesEndRef = useRef<HTMLDivElement>(null)

	const hasText = value.length > 0

	useEffect(() => {
		if (messagesEndRef.current) {
			messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
		}
	}, [messages])

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files) return

		const newFiles: UploadedFile[] = Array.from(files).map((file) => {
			const isImage = file.type.startsWith('image/')
			const isVideo = file.type.startsWith('video/')
			return {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				file,
				preview: isImage || isVideo ? URL.createObjectURL(file) : '',
				type: isVideo ? 'video' : isImage ? 'image' : 'file',
			}
		})

		setUploadedFiles((prev) => [...prev, ...newFiles])
		e.target.value = ''
	}

	const removeFile = (id: string) => {
		setUploadedFiles((prev) => {
			const file = prev.find((f) => f.id === id)
			if (file?.preview) URL.revokeObjectURL(file.preview)
			return prev.filter((f) => f.id !== id)
		})
	}

	const handlePlusMenuClick = (itemId: string) => {
		setActiveDropdown(null)
		if (itemId === 'files') fileInputRef.current?.click()
		else if (itemId === 'videos') videoInputRef.current?.click()
	}

	const handleSubmit = () => {
		if (!value.trim() && uploadedFiles.length === 0) return

		setHasSubmitted(true)
		const attachments = uploadedFiles.map((file) => ({
			preview: file.preview,
			type: file.type,
		}))

		setMessages((prev) => [
			...prev,
			{
				id: `msg-${Date.now()}`,
				role: 'user',
				content: value,
				attachments: attachments.length > 0 ? attachments : undefined,
			},
		])

		if (onSubmit) {
			onSubmit(value, attachments)
		}

		setValue('')
		setUploadedFiles([])

		// Simulate AI reply (remove in production)
		setTimeout(() => {
			setMessages((prev) => [
				...prev,
				{
					id: `msg-${Date.now()}-ai`,
					role: 'ai',
					content: `Your response content here...`,
				},
			])
		}, 500)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSubmit()
		}
	}

	return (
		<LazyMotion features={domMax}>
			<AIInputContext.Provider value={{ activeDropdown, setActiveDropdown }}>
				<div
					className={cn(
						'relative flex h-[100dvh] w-full flex-col overflow-hidden',
						className,
					)}
				>
					<AIInputMessages
						messages={messages}
						hasSubmitted={hasSubmitted}
						messagesEndRef={messagesEndRef}
					/>

					<m.div
						layout
						transition={{ type: 'spring', damping: 25, stiffness: 200 }}
						className={cn(
							'z-20 flex w-full flex-col px-4',
							hasSubmitted ? 'pb-8' : 'flex-1 items-center justify-center',
						)}
					>
						<div className='group relative mx-auto w-full max-w-2xl'>
							<m.div
								layoutId='input-container'
								layout
								transition={{ duration: 0.3, ease: 'easeInOut' }}
								className='relative rounded-[32px] border border-black/5 bg-white dark:border-white/5 dark:bg-[#09090b]'
							>
								<input
									ref={fileInputRef}
									type='file'
									multiple
									accept='image/*,.pdf,.doc,.docx,.txt,.md'
									className='hidden'
									onChange={handleFileSelect}
								/>
								<input
									ref={videoInputRef}
									type='file'
									multiple
									accept='video/*'
									className='hidden'
									onChange={handleFileSelect}
								/>

								<AIInputFilePreview
									files={uploadedFiles}
									onRemove={removeFile}
								/>

								<div className='p-4 pb-14'>
									<m.textarea
										layout
										transition={{ duration: 0.2, ease: 'easeInOut' }}
										value={value}
										onChange={(e) => setValue(e.target.value)}
										onKeyDown={handleKeyDown}
										disabled={isListening}
										placeholder={isListening ? 'Listening...' : placeholder}
										className='max-h-[200px] min-h-[40px] w-full resize-none bg-transparent text-lg text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500'
										rows={1}
										style={{ minHeight: '44px', height: 'auto' }}
										onInput={(e) => {
											const target = e.target as HTMLTextAreaElement
											target.style.height = 'auto'
											target.style.height = `${target.scrollHeight}px`
										}}
									/>
								</div>

								{/* Bottom Controls */}
								<div className='absolute right-4 bottom-4 left-4 z-10 flex items-center justify-between'>
									{/* Left Side */}
									<div className='flex items-center gap-2'>
										<div className='relative'>
											<button
												onClick={() =>
													setActiveDropdown(
														activeDropdown === 'plus' ? null : 'plus',
													)
												}
												className={cn(
													'rounded-full border p-2.5 transition-colors',
													activeDropdown === 'plus'
														? 'border-black/10 bg-zinc-100 text-zinc-900 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-100'
														: 'border-black/5 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:border-white/5 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800',
												)}
											>
												<Plus
													className={cn(
														'h-5 w-5 transition-transform',
														activeDropdown === 'plus' && 'rotate-45',
													)}
												/>
											</button>
											<AIInputDropdown
												isOpen={activeDropdown === 'plus'}
												onClose={() => setActiveDropdown(null)}
												items={plusMenuItems}
												className='bottom-full left-0 mb-2 w-56'
												renderItem={(item) => (
													<button
														onClick={() => handlePlusMenuClick(item.id)}
														className='group flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'
													>
														<item.icon className='h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200' />
														<span className='font-medium text-sm'>
															{item.label}
														</span>
													</button>
												)}
											/>
										</div>

										<div className='relative hidden sm:block'>
											{selectedTool ? (
												<AIInputPillButton
													layoutId='tools-pill'
													icon={selectedTool.icon}
													isActive={activeDropdown === 'tools'}
													showChevron
													chevronRotated={activeDropdown === 'tools'}
													showClose
													onClick={() =>
														setActiveDropdown(
															activeDropdown === 'tools' ? null : 'tools',
														)
													}
													onClose={() => {
														setSelectedTool(null)
														setActiveDropdown(null)
													}}
												>
													<span className='font-medium text-sm'>
														{selectedTool.label}
													</span>
												</AIInputPillButton>
											) : (
												<AIInputPillButton
													layoutId='tools-pill'
													icon={Sparkles}
													isActive={activeDropdown === 'tools'}
													showChevron
													chevronRotated={activeDropdown === 'tools'}
													onClick={() =>
														setActiveDropdown(
															activeDropdown === 'tools' ? null : 'tools',
														)
													}
												>
													<span className='font-medium text-sm'>Tools</span>
												</AIInputPillButton>
											)}

											<AIInputDropdown
												isOpen={activeDropdown === 'tools'}
												onClose={() => setActiveDropdown(null)}
												items={tools}
												className='bottom-full left-0 mb-2 w-64'
												renderItem={(item) => (
													<button
														onClick={() => {
															setSelectedTool(item)
															setActiveDropdown(null)
														}}
														className={cn(
															'group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10',
															selectedTool?.label === item.label &&
																'bg-zinc-100 dark:bg-zinc-800',
														)}
													>
														<item.icon className='h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200' />
														<span className='font-medium text-sm'>
															{item.label}
														</span>
													</button>
												)}
											/>
										</div>
									</div>

									{/* Right Side */}
									<div className='flex items-center gap-2'>
										<div className='relative'>
											<AIInputPillButton
												layoutId='model-pill'
												icon={selectedModel.icon}
												isActive={activeDropdown === 'model'}
												showChevron
												chevronRotated={activeDropdown === 'model'}
												onClick={() =>
													setActiveDropdown(
														activeDropdown === 'model' ? null : 'model',
													)
												}
											>
												<span className='font-medium text-sm'>
													{selectedModel.name}
												</span>
											</AIInputPillButton>

											<AIInputDropdown
												isOpen={activeDropdown === 'model'}
												onClose={() => setActiveDropdown(null)}
												items={models}
												className='right-0 bottom-full mb-2 w-48 p-1'
												renderItem={(model) => (
													<button
														onClick={() => {
															setSelectedModel(model)
															setActiveDropdown(null)
														}}
														className={cn(
															'group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10',
															selectedModel.id === model.id &&
																'bg-zinc-100 dark:bg-zinc-800',
														)}
													>
														<model.icon className='h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200' />
														<span className='font-medium text-sm'>
															{model.name}
														</span>
														{selectedModel.id === model.id && (
															<Check className='ml-auto h-4 w-4 text-zinc-500' />
														)}
													</button>
												)}
											/>
										</div>

										<div className='flex justify-end'>
											<AnimatePresence mode='wait' initial={false}>
												{hasText ? (
													<m.div
														key='active-controls'
														initial={{ opacity: 0, scale: 0.9 }}
														animate={{ opacity: 1, scale: 1 }}
														exit={{ opacity: 0, scale: 0.9 }}
														transition={{ duration: 0.15 }}
														className='flex items-center gap-2'
													>
														<button
															onClick={() => setValue('')}
															className='p-2 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
														>
															<X className='h-4 w-4' />
														</button>
														<button
															onClick={handleSubmit}
															className='rounded-full bg-zinc-900 p-2.5 text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900'
														>
															<ArrowUp className='h-5 w-5' />
														</button>
													</m.div>
												) : (
													<m.div
														key='inactive-controls'
														initial={{ opacity: 0, scale: 0.9 }}
														animate={{ opacity: 1, scale: 1 }}
														exit={{ opacity: 0, scale: 0.9 }}
														transition={{ duration: 0.15 }}
														className='flex items-center gap-2'
													>
														<button
															onClick={() => setIsListening(!isListening)}
															className={cn(
																'relative cursor-pointer p-2 transition-all duration-300',
																isListening
																	? 'rounded-full bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
																	: 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300',
															)}
														>
															{isListening ? (
																<Square
																	className='h-4 w-4'
																	fill='currentColor'
																/>
															) : (
																<Mic className='h-4 w-4' />
															)}
															{isListening && (
																<span className='absolute inset-0 animate-ping rounded-full bg-red-500/20' />
															)}
														</button>
														<button
															disabled
															className='rounded-full bg-zinc-100 p-2.5 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600'
														>
															<ArrowUp className='h-4 w-4' />
														</button>
													</m.div>
												)}
											</AnimatePresence>
										</div>
									</div>
								</div>
							</m.div>
						</div>
					</m.div>
				</div>
			</AIInputContext.Provider>
		</LazyMotion>
	)
}
AIInput.displayName = 'AIInput'

export default AIInput
