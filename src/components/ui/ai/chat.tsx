'use client'

import { CheckIcon, GlobeIcon } from 'lucide-react'
import { useMemo } from 'react'
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorLogoGroup,
	ModelSelectorName,
	ModelSelectorTrigger,
} from '../ai-elements/model-selector'
import {
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputBody,
	PromptInputButton,
	PromptInputFooter,
	PromptInputHeader,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from '../ai-elements/prompt-input'
import { Suggestion, Suggestions } from '../ai-elements/suggestion'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '../select'
import { MODEL_GROUPS, MODELS } from './models'
import type { useAi } from './use-ai'

// `useAi`'s return is a discriminated union (TanStack's UseChatReturn), which
// an `interface` cannot `extends`; use an intersection type alias instead.
type ChatIterationProps = ReturnType<typeof useAi> & {
	modelSelectorVariant?: 'dropdown' | 'modal'
}

export function ChatIteration(props: ChatIterationProps) {
	return (
		<div className='grid shrink-0 gap-4 pt-4'>
			<Suggestions className='px-4'>
				{props.suggestions?.map(({ onClick, ...suggestion }) => (
					<Suggestion
						key={suggestion.suggestion}
						onClick={(sg) => {
							return onClick?.(sg, {
								model: props.model,
								webSearch: props.webSearch,
								artifact: props.artifact,
								modelSelectorOpen: props.modelSelectorOpen,
							})
						}}
						{...suggestion}
					/>
				))}
			</Suggestions>
			<div className='w-full px-4 pb-4'>
				<PromptInput globalDrop multiple onSubmit={props.handleSubmit}>
					<PromptInputHeader></PromptInputHeader>
					<PromptInputBody>
						<PromptInputTextarea
							onChange={({ target }) => props.input.setInput(target.value)}
							value={props.input.value}
						/>
					</PromptInputBody>
					<PromptInputFooter>
						<PromptInputTools>
							<PromptInputActionMenu>
								<PromptInputActionMenuTrigger />
								<PromptInputActionMenuContent>
									<PromptInputActionAddAttachments />
								</PromptInputActionMenuContent>
							</PromptInputActionMenu>
							<PromptInputButton
								onClick={props.toggleWebSearch}
								variant={props.webSearch ? 'default' : 'ghost'}
							>
								<GlobeIcon size={16} />
								<span>Search</span>
							</PromptInputButton>
							<ModelsSelections
								model={props.model}
								onSelectModel={(modelId) =>
									props.changeModel(
										modelId as Parameters<typeof props.changeModel>[0],
									)
								}
								variant={props.modelSelectorVariant ?? 'modal'}
								open={props.modelSelectorOpen}
								onOpenChange={props.setModelSelectorOpen}
							/>
						</PromptInputTools>
						<PromptInputSubmit
							disabled={
								!(props.input.value.trim() || props.status) ||
								props.status === 'streaming'
							}
							status={props.status}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	)
}

interface ModelsSelectionsProps {
	model: (typeof MODELS)[number]['id']
	onSelectModel: (modelId: string) => void
	variant: 'dropdown' | 'modal'
	open: boolean
	onOpenChange: (open: boolean) => void
}
function ModelsSelections(props: ModelsSelectionsProps) {
	const selectedModelData = useMemo(() => {
		return MODELS.find((m) => m.id === props.model)
	}, [props.model])

	switch (props.variant) {
		case 'dropdown':
			return (
				<Select
					value={props.model}
					onValueChange={(value) => value && props.onSelectModel(value)}
				>
					<SelectTrigger className='w-[220px]'>
						<SelectValue placeholder='Select model'>
							{selectedModelData && (
								<span className='flex items-center gap-2'>
									<ModelSelectorLogo provider={selectedModelData.chefSlug} />
									<span>{selectedModelData.name}</span>
									<span className='text-muted-foreground'>
										({selectedModelData.cost})
									</span>
								</span>
							)}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MODEL_GROUPS.map(({ chef, models }) => (
							<SelectGroup key={chef}>
								<SelectLabel>{chef}</SelectLabel>
								{models.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										<span className='flex items-center gap-2'>
											<ModelSelectorLogo provider={model.chefSlug} />
											<span>{model.name}</span>
											<span className='text-muted-foreground'>
												({model.cost})
											</span>
										</span>
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
			)
		case 'modal':
			return (
				<ModelSelector
					onOpenChange={(open) => props.onOpenChange(open)}
					open={props.open}
				>
					<ModelSelectorTrigger
						render={
							<PromptInputButton>
								{selectedModelData?.chefSlug && (
									<ModelSelectorLogo provider={selectedModelData.chefSlug} />
								)}
								{selectedModelData?.name && (
									<ModelSelectorName>
										{selectedModelData.name}
									</ModelSelectorName>
								)}
							</PromptInputButton>
						}
					/>
					<ModelSelectorContent>
						<ModelSelectorInput placeholder='Search models...' />
						<ModelSelectorList>
							<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
							{MODEL_GROUPS.map(({ chef, models }) => (
								<ModelSelectorGroup key={chef} heading={chef}>
									{models.map((m) => (
										<ModelSelectorItem
											key={m.id}
											onSelect={() => {
												props.onSelectModel(m.id)
												props.onOpenChange(false)
											}}
											value={m.id}
										>
											<ModelSelectorLogo provider={m.chefSlug} />
											<ModelSelectorName>
												{m.name} ({m.cost})
											</ModelSelectorName>
											<ModelSelectorLogoGroup>
												{m.providers.map((provider) => (
													<ModelSelectorLogo
														key={provider}
														provider={provider}
													/>
												))}
											</ModelSelectorLogoGroup>
											{props.model === m.id ? (
												<CheckIcon className='ml-auto size-4' />
											) : (
												<div className='ml-auto size-4' />
											)}
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							))}
						</ModelSelectorList>
					</ModelSelectorContent>
				</ModelSelector>
			)
	}
}
