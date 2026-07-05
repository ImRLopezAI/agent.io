import type { LinkHTMLAttributes, MetaHTMLAttributes } from 'react'

type MetaTag = MetaHTMLAttributes<HTMLMetaElement>
type LinkTag = LinkHTMLAttributes<HTMLLinkElement>

export type HeadAssets = {
	meta?: MetaTag[]
	links?: LinkTag[]
}

export type Author = {
	name?: string
	url?: string
}

export type TemplateString = {
	template?: string
	default?: string
	absolute?: string
}

export type Robots = {
	index?: boolean
	follow?: boolean
	nocache?: boolean
	googleBot?: {
		index?: boolean
		follow?: boolean
		noimageindex?: boolean
		'max-video-preview'?: number | string
		'max-image-preview'?: 'none' | 'standard' | 'large'
		'max-snippet'?: number
	}
}

export type OpenGraphImage = {
	url: string | URL
	width?: number
	height?: number
	alt?: string
	type?: string
}

export type OpenGraph = {
	title?: string
	description?: string
	url?: string | URL
	siteName?: string
	locale?: string
	type?: string
	images?: string | URL | OpenGraphImage | Array<string | URL | OpenGraphImage>
	videos?: Array<{ url: string | URL; width?: number; height?: number }>
	audio?: Array<{ url: string | URL }>
	publishedTime?: string
	modifiedTime?: string
	authors?: string | string[]
}

export type Twitter = {
	card?: 'summary' | 'summary_large_image' | 'app' | 'player'
	title?: string
	description?: string
	site?: string
	siteId?: string
	creator?: string
	creatorId?: string
	images?: string | URL | OpenGraphImage | Array<string | URL | OpenGraphImage>
}

export type Icons = {
	icon?: string | URL | IconDescriptor | Array<string | URL | IconDescriptor>
	shortcut?:
		| string
		| URL
		| IconDescriptor
		| Array<string | URL | IconDescriptor>
	apple?: string | URL | IconDescriptor | Array<string | URL | IconDescriptor>
	other?: IconDescriptor | Array<IconDescriptor>
}

export type IconDescriptor = {
	url: string | URL
	rel?: string
	media?: string
	sizes?: string
	type?: string
}

export type AlternateURLs = {
	canonical?: string | URL | null
	languages?: Record<string, string | URL | null>
	media?: Record<string, string | URL | null>
	types?: Record<string, string | URL | null>
}

export type Verification = {
	google?: string | string[]
	yandex?: string | string[]
	yahoo?: string | string[]
	me?: string | string[]
	other?: Record<string, string | string[]>
}

export type Metadata = {
	metadataBase?: string | URL | null
	title?: string | TemplateString | null
	description?: string | null
	authors?: Author | Author[] | null
	applicationName?: string | null
	generator?: string | null
	keywords?: string | string[] | null
	referrer?: string | null
	creator?: string | null
	publisher?: string | null
	robots?: string | Robots | null
	alternates?: AlternateURLs | null
	icons?: string | URL | IconDescriptor | Icons | Array<IconDescriptor> | null
	manifest?: string | URL | null
	openGraph?: OpenGraph | null
	twitter?: Twitter | null
	facebook?: { appId?: string; admins?: string | string[] } | null
	pinterest?: { richPin?: string | boolean } | null
	verification?: Verification
	appleWebApp?: {
		capable?: boolean
		title?: string
		statusBarStyle?: 'default' | 'black' | 'black-translucent'
	} | null
	formatDetection?: {
		telephone?: boolean
		date?: boolean
		address?: boolean
		email?: boolean
		url?: boolean
	} | null
	itunes?: { appId: string; appArgument?: string } | null
	abstract?: string | null
	category?: string | null
	classification?: string | null
	archives?: string | string[] | null
	assets?: string | string[] | null
	bookmarks?: string | string[] | null
	pagination?: {
		previous?: string | URL | null
		next?: string | URL | null
	}
	other?: Record<string, string | number | Array<string | number>>
	themeColor?:
		| string
		| { media?: string; color: string }
		| Array<{ media?: string; color: string }>
	colorScheme?: 'normal' | 'light' | 'dark' | 'light dark' | 'dark light' | null
}

export type MetadataContext = {
	titleTemplate?: string
	metadataBase?: string | URL | null
}

export type HeadFnContext = {
	match: {
		routeId: string
		fullPath: string
		pathname: string
		context?: Record<string, unknown>
	}
	matches: Array<{
		routeId: string
		context?: Record<string, unknown>
	}>
	params: Record<string, string>
	loaderData?: unknown
}

type MetadataInput =
	| Metadata
	| ((ctx: HeadFnContext) => Metadata | Promise<Metadata>)

type RegisteredHeadFn = ((
	ctx: HeadFnContext,
) => HeadAssets | Promise<HeadAssets>) & {
	__metadata?: MetadataInput
}

const routeMetadataRegistry = new Map<string, Metadata>()

function isTemplateString(title: Metadata['title']): title is TemplateString {
	return typeof title === 'object' && title !== null && !Array.isArray(title)
}

function resolveMetadataBase(
	metadata: Metadata,
	context?: MetadataContext,
): URL | string | null {
	return metadata.metadataBase ?? context?.metadataBase ?? null
}

function resolveMetadataUrl(
	value: string | URL,
	base?: URL | string | null,
): string {
	const href = typeof value === 'string' ? value : value.href
	if (/^https?:\/\//.test(href) || href.startsWith('//')) return href
	if (!base) return href

	const baseUrl = typeof base === 'string' ? new URL(base) : base
	return new URL(href.replace(/^\.\//, ''), baseUrl).toString()
}

async function resolveMetadataInput(
	input: MetadataInput,
	ctx: HeadFnContext,
): Promise<Metadata> {
	return typeof input === 'function' ? await input(ctx) : input
}

function isTemplateOnlyTitle(title: Metadata['title']): boolean {
	return isTemplateString(title) && Boolean(title.template) && !title.absolute
}

function stripTemplateOnlyTitle(metadata: Metadata): Metadata {
	if (!isTemplateOnlyTitle(metadata.title)) return metadata

	const { title: _title, ...rest } = metadata
	return rest
}

function mergeMetadataChain(chain: Metadata[]): Metadata {
	let merged: Metadata = {}

	for (const current of chain) {
		merged = {
			...merged,
			...current,
			openGraph: current.openGraph ?? merged.openGraph,
			twitter: current.twitter ?? merged.twitter,
			alternates: current.alternates ?? merged.alternates,
			icons: current.icons ?? merged.icons,
			verification: current.verification ?? merged.verification,
			appleWebApp: current.appleWebApp ?? merged.appleWebApp,
			formatDetection: current.formatDetection ?? merged.formatDetection,
			facebook: current.facebook ?? merged.facebook,
			pinterest: current.pinterest ?? merged.pinterest,
			pagination: current.pagination ?? merged.pagination,
			other: current.other ?? merged.other,
			robots: current.robots ?? merged.robots,
		}
		delete merged.title
	}

	return merged
}

function resolveMergedTitle(chain: Metadata[]): string | undefined {
	const leafToRoot = [...chain].reverse()

	let segmentTitle: string | undefined
	let titleTemplate: string | undefined
	let absoluteTitle: string | undefined
	let defaultTitle: string | undefined

	for (const metadata of leafToRoot) {
		if (metadata.title == null) continue

		if (typeof metadata.title === 'string') {
			segmentTitle ??= metadata.title
			continue
		}

		if (metadata.title.absolute) {
			absoluteTitle ??= metadata.title.absolute
		}
		if (metadata.title.template) {
			titleTemplate ??= metadata.title.template
		}
		if (metadata.title.default) {
			defaultTitle ??= metadata.title.default
		}
	}

	if (absoluteTitle) return absoluteTitle
	if (segmentTitle && titleTemplate) {
		return titleTemplate.replace('%s', segmentTitle)
	}
	if (segmentTitle) return segmentTitle
	if (defaultTitle) return defaultTitle

	return undefined
}

function collectMetadataChain(
	ctx: HeadFnContext,
	currentMetadata: Metadata,
): Metadata[] {
	return ctx.matches.flatMap((match) => {
		if (match.routeId === ctx.match.routeId) {
			return [currentMetadata]
		}

		const metadata = routeMetadataRegistry.get(match.routeId)
		return metadata ? [metadata] : []
	})
}

function findParentMetadataBase(chain: Metadata[]): string | URL | null {
	for (let index = chain.length - 2; index >= 0; index -= 1) {
		const metadataBase = chain[index]?.metadataBase
		if (metadataBase) return metadataBase
	}

	return null
}

function buildMetadataContext(
	chain: Metadata[],
	metadata: Metadata,
): MetadataContext {
	return {
		metadataBase: resolveMetadataBase(metadata, {
			metadataBase: findParentMetadataBase(chain),
		}),
	}
}

function pushMeta(meta: MetaTag[], tag: MetaTag) {
	meta.push(tag)
}

function pushLink(links: LinkTag[], tag: LinkTag) {
	links.push(tag)
}

function pushNamedMeta(
	meta: MetaTag[],
	name: string,
	content: string | number | boolean,
) {
	pushMeta(meta, { name, content: String(content) })
}

function pushPropertyMeta(
	meta: MetaTag[],
	property: string,
	content: string | number | boolean,
) {
	pushMeta(meta, { property, content: String(content) })
}

function pushManyLinks(
	links: LinkTag[],
	rel: string,
	values: string | string[] | undefined,
) {
	if (!values) return
	for (const href of Array.isArray(values) ? values : [values]) {
		pushLink(links, { rel, href })
	}
}

function robotsToContent(robots: string | Robots): {
	robots?: string
	googleBot?: string
} {
	if (typeof robots === 'string') return { robots }

	const rules: string[] = []
	if (robots.index === false) rules.push('noindex')
	else if (robots.index) rules.push('index')
	if (robots.follow === false) rules.push('nofollow')
	else if (robots.follow) rules.push('follow')
	if (robots.nocache) rules.push('nocache')

	let googleBot: string | undefined
	if (robots.googleBot) {
		const googleRules: string[] = []
		if (robots.googleBot.index === false) googleRules.push('noindex')
		else if (robots.googleBot.index) googleRules.push('index')
		if (robots.googleBot.follow === false) googleRules.push('nofollow')
		else if (robots.googleBot.follow) googleRules.push('follow')
		if (robots.googleBot.noimageindex) googleRules.push('noimageindex')
		if (robots.googleBot['max-video-preview'] != null) {
			googleRules.push(
				`max-video-preview:${robots.googleBot['max-video-preview']}`,
			)
		}
		if (robots.googleBot['max-image-preview']) {
			googleRules.push(
				`max-image-preview:${robots.googleBot['max-image-preview']}`,
			)
		}
		if (robots.googleBot['max-snippet'] != null) {
			googleRules.push(`max-snippet:${robots.googleBot['max-snippet']}`)
		}
		if (googleRules.length > 0) googleBot = googleRules.join(', ')
	}

	return {
		...(rules.length > 0 ? { robots: rules.join(', ') } : {}),
		...(googleBot ? { googleBot } : {}),
	}
}

function formatDetectionToContent(
	formatDetection: NonNullable<Metadata['formatDetection']>,
): string {
	const parts: string[] = []
	for (const [key, enabled] of Object.entries(formatDetection)) {
		parts.push(`${key}=${enabled ? 'yes' : 'no'}`)
	}
	return parts.join(', ')
}

type ResolvedOpenGraphImage = Omit<OpenGraphImage, 'url'> & { url: string }

function normalizeImages(
	images: OpenGraph['images'],
	base?: URL | string | null,
): ResolvedOpenGraphImage[] {
	if (!images) return []
	const list = Array.isArray(images) ? images : [images]

	return list.map((image) => {
		if (typeof image === 'string' || image instanceof URL) {
			return { url: resolveMetadataUrl(image, base) }
		}
		return {
			...image,
			url: resolveMetadataUrl(image.url, base),
		}
	})
}

function appendIconDescriptors(
	links: LinkTag[],
	rel: string,
	icons: Icons[keyof Icons] | undefined,
	base?: URL | string | null,
) {
	if (!icons) return
	const list = Array.isArray(icons) ? icons : [icons]

	for (const icon of list) {
		if (typeof icon === 'string' || icon instanceof URL) {
			pushLink(links, { rel, href: resolveMetadataUrl(icon, base) })
			continue
		}

		pushLink(links, {
			rel: icon.rel ?? rel,
			href: resolveMetadataUrl(icon.url, base),
			media: icon.media,
			sizes: icon.sizes,
			type: icon.type,
		})
	}
}

function appendOpenGraph(
	meta: MetaTag[],
	openGraph: OpenGraph,
	base?: URL | string | null,
) {
	if (openGraph.title) pushPropertyMeta(meta, 'og:title', openGraph.title)
	if (openGraph.description) {
		pushPropertyMeta(meta, 'og:description', openGraph.description)
	}
	if (openGraph.url) {
		pushPropertyMeta(meta, 'og:url', resolveMetadataUrl(openGraph.url, base))
	}
	if (openGraph.siteName)
		pushPropertyMeta(meta, 'og:site_name', openGraph.siteName)
	if (openGraph.locale) pushPropertyMeta(meta, 'og:locale', openGraph.locale)
	if (openGraph.type) pushPropertyMeta(meta, 'og:type', openGraph.type)
	if (openGraph.publishedTime) {
		pushPropertyMeta(meta, 'article:published_time', openGraph.publishedTime)
	}
	if (openGraph.modifiedTime) {
		pushPropertyMeta(meta, 'article:modified_time', openGraph.modifiedTime)
	}
	if (openGraph.authors) {
		for (const author of Array.isArray(openGraph.authors)
			? openGraph.authors
			: [openGraph.authors]) {
			pushPropertyMeta(meta, 'article:author', author)
		}
	}

	for (const image of normalizeImages(openGraph.images, base)) {
		pushPropertyMeta(meta, 'og:image', image.url)
		if (image.width != null)
			pushPropertyMeta(meta, 'og:image:width', image.width)
		if (image.height != null)
			pushPropertyMeta(meta, 'og:image:height', image.height)
		if (image.alt) pushPropertyMeta(meta, 'og:image:alt', image.alt)
	}

	for (const video of openGraph.videos ?? []) {
		pushPropertyMeta(meta, 'og:video', resolveMetadataUrl(video.url, base))
		if (video.width != null)
			pushPropertyMeta(meta, 'og:video:width', video.width)
		if (video.height != null)
			pushPropertyMeta(meta, 'og:video:height', video.height)
	}

	for (const audio of openGraph.audio ?? []) {
		pushPropertyMeta(meta, 'og:audio', resolveMetadataUrl(audio.url, base))
	}
}

function appendTwitter(
	meta: MetaTag[],
	twitter: Twitter,
	base?: URL | string | null,
) {
	if (twitter.card) pushNamedMeta(meta, 'twitter:card', twitter.card)
	if (twitter.title) pushNamedMeta(meta, 'twitter:title', twitter.title)
	if (twitter.description) {
		pushNamedMeta(meta, 'twitter:description', twitter.description)
	}
	if (twitter.site) pushNamedMeta(meta, 'twitter:site', twitter.site)
	if (twitter.siteId) pushNamedMeta(meta, 'twitter:site:id', twitter.siteId)
	if (twitter.creator) pushNamedMeta(meta, 'twitter:creator', twitter.creator)
	if (twitter.creatorId) {
		pushNamedMeta(meta, 'twitter:creator:id', twitter.creatorId)
	}

	for (const image of normalizeImages(twitter.images, base)) {
		pushNamedMeta(meta, 'twitter:image', image.url)
		if (image.alt) pushNamedMeta(meta, 'twitter:image:alt', image.alt)
	}
}

function appendAlternates(
	links: LinkTag[],
	alternates: AlternateURLs,
	base?: URL | string | null,
) {
	if (alternates.canonical) {
		pushLink(links, {
			rel: 'canonical',
			href: resolveMetadataUrl(alternates.canonical, base),
		})
	}

	for (const [language, href] of Object.entries(alternates.languages ?? {})) {
		if (!href) continue
		pushLink(links, {
			rel: 'alternate',
			hrefLang: language,
			href: resolveMetadataUrl(href, base),
		})
	}

	for (const [media, href] of Object.entries(alternates.media ?? {})) {
		if (!href) continue
		pushLink(links, {
			rel: 'alternate',
			media,
			href: resolveMetadataUrl(href, base),
		})
	}

	for (const [type, href] of Object.entries(alternates.types ?? {})) {
		if (!href) continue
		pushLink(links, {
			rel: 'alternate',
			type,
			href: resolveMetadataUrl(href, base),
		})
	}
}

function appendVerification(meta: MetaTag[], verification: Verification) {
	if (verification.google) {
		for (const value of Array.isArray(verification.google)
			? verification.google
			: [verification.google]) {
			pushNamedMeta(meta, 'google-site-verification', value)
		}
	}
	if (verification.yandex) {
		for (const value of Array.isArray(verification.yandex)
			? verification.yandex
			: [verification.yandex]) {
			pushNamedMeta(meta, 'yandex-verification', value)
		}
	}
	if (verification.yahoo) {
		for (const value of Array.isArray(verification.yahoo)
			? verification.yahoo
			: [verification.yahoo]) {
			pushNamedMeta(meta, 'y_key', value)
		}
	}
	if (verification.me) {
		for (const value of Array.isArray(verification.me)
			? verification.me
			: [verification.me]) {
			pushNamedMeta(meta, 'me', value)
		}
	}
	for (const [name, value] of Object.entries(verification.other ?? {})) {
		for (const content of Array.isArray(value) ? value : [value]) {
			pushNamedMeta(meta, name, content)
		}
	}
}

export function metadataToHead(
	metadata: Metadata,
	context?: MetadataContext,
): HeadAssets {
	const meta: MetaTag[] = []
	const links: LinkTag[] = []
	const base = resolveMetadataBase(metadata, context)
	const title =
		metadata.title == null
			? undefined
			: typeof metadata.title === 'string'
				? metadata.title
				: (metadata.title.absolute ?? metadata.title.default)

	if (title || metadata.description) {
		pushMeta(meta, {
			...(title ? { title } : {}),
			...(metadata.description ? { description: metadata.description } : {}),
		})
	}

	if (metadata.applicationName) {
		pushNamedMeta(meta, 'application-name', metadata.applicationName)
	}
	if (metadata.generator) pushNamedMeta(meta, 'generator', metadata.generator)
	if (metadata.keywords) {
		const keywords = Array.isArray(metadata.keywords)
			? metadata.keywords.join(', ')
			: metadata.keywords
		pushNamedMeta(meta, 'keywords', keywords)
	}
	if (metadata.referrer) pushNamedMeta(meta, 'referrer', metadata.referrer)
	if (metadata.creator) pushNamedMeta(meta, 'creator', metadata.creator)
	if (metadata.publisher) pushNamedMeta(meta, 'publisher', metadata.publisher)
	if (metadata.abstract) pushNamedMeta(meta, 'abstract', metadata.abstract)
	if (metadata.category) pushNamedMeta(meta, 'category', metadata.category)
	if (metadata.classification) {
		pushNamedMeta(meta, 'classification', metadata.classification)
	}

	for (const author of Array.isArray(metadata.authors)
		? metadata.authors
		: metadata.authors
			? [metadata.authors]
			: []) {
		if (author.name) pushNamedMeta(meta, 'author', author.name)
		if (author.url) pushLink(links, { rel: 'author', href: author.url })
	}

	if (metadata.robots) {
		const { robots, googleBot } = robotsToContent(metadata.robots)
		if (robots) pushNamedMeta(meta, 'robots', robots)
		if (googleBot) pushNamedMeta(meta, 'googlebot', googleBot)
	}

	if (metadata.formatDetection) {
		pushNamedMeta(
			meta,
			'format-detection',
			formatDetectionToContent(metadata.formatDetection),
		)
	}

	if (metadata.colorScheme) {
		pushNamedMeta(meta, 'color-scheme', metadata.colorScheme)
	}

	if (metadata.themeColor) {
		const themeColors = Array.isArray(metadata.themeColor)
			? metadata.themeColor
			: [metadata.themeColor]
		for (const themeColor of themeColors) {
			if (typeof themeColor === 'string') {
				pushNamedMeta(meta, 'theme-color', themeColor)
			} else {
				pushMeta(meta, {
					name: 'theme-color',
					content: themeColor.color,
					media: themeColor.media,
				})
			}
		}
	}

	if (metadata.manifest) {
		pushLink(links, {
			rel: 'manifest',
			href: resolveMetadataUrl(metadata.manifest, base),
		})
	}

	if (metadata.icons) {
		if (typeof metadata.icons === 'string' || metadata.icons instanceof URL) {
			pushLink(links, {
				rel: 'icon',
				href: resolveMetadataUrl(metadata.icons, base),
			})
		} else if (Array.isArray(metadata.icons)) {
			appendIconDescriptors(links, 'icon', metadata.icons, base)
		} else if ('url' in metadata.icons) {
			appendIconDescriptors(links, 'icon', metadata.icons, base)
		} else {
			appendIconDescriptors(
				links,
				'shortcut icon',
				metadata.icons.shortcut,
				base,
			)
			appendIconDescriptors(links, 'icon', metadata.icons.icon, base)
			appendIconDescriptors(
				links,
				'apple-touch-icon',
				metadata.icons.apple,
				base,
			)
			appendIconDescriptors(links, 'icon', metadata.icons.other, base)
		}
	}

	if (metadata.alternates) {
		appendAlternates(links, metadata.alternates, base)
	}

	if (metadata.openGraph) {
		appendOpenGraph(meta, metadata.openGraph, base)
	}

	if (metadata.twitter) {
		appendTwitter(meta, metadata.twitter, base)
	}

	if (metadata.facebook?.appId) {
		pushPropertyMeta(meta, 'fb:app_id', metadata.facebook.appId)
	}
	if (metadata.facebook?.admins) {
		for (const admin of Array.isArray(metadata.facebook.admins)
			? metadata.facebook.admins
			: [metadata.facebook.admins]) {
			pushPropertyMeta(meta, 'fb:admins', admin)
		}
	}

	if (metadata.pinterest?.richPin != null) {
		pushNamedMeta(meta, 'pinterest-rich-pin', metadata.pinterest.richPin)
	}

	if (metadata.verification) {
		appendVerification(meta, metadata.verification)
	}

	if (metadata.appleWebApp) {
		if (metadata.appleWebApp.capable) {
			pushNamedMeta(meta, 'mobile-web-app-capable', 'yes')
		}
		if (metadata.appleWebApp.title) {
			pushNamedMeta(
				meta,
				'apple-mobile-web-app-title',
				metadata.appleWebApp.title,
			)
		}
		if (metadata.appleWebApp.statusBarStyle) {
			pushNamedMeta(
				meta,
				'apple-mobile-web-app-status-bar-style',
				metadata.appleWebApp.statusBarStyle,
			)
		}
	}

	if (metadata.itunes) {
		const parts = [`app-id=${metadata.itunes.appId}`]
		if (metadata.itunes.appArgument) {
			parts.push(`app-argument=${metadata.itunes.appArgument}`)
		}
		pushNamedMeta(meta, 'apple-itunes-app', parts.join(', '))
	}

	pushManyLinks(links, 'archives', metadata.archives ?? undefined)
	pushManyLinks(links, 'assets', metadata.assets ?? undefined)
	pushManyLinks(links, 'bookmarks', metadata.bookmarks ?? undefined)

	if (metadata.pagination?.previous) {
		pushLink(links, {
			rel: 'prev',
			href: resolveMetadataUrl(metadata.pagination.previous, base),
		})
	}
	if (metadata.pagination?.next) {
		pushLink(links, {
			rel: 'next',
			href: resolveMetadataUrl(metadata.pagination.next, base),
		})
	}

	for (const [name, value] of Object.entries(metadata.other ?? {})) {
		for (const content of Array.isArray(value) ? value : [value]) {
			pushNamedMeta(meta, name, content)
		}
	}

	return {
		...(meta.length > 0 ? { meta } : {}),
		...(links.length > 0 ? { links } : {}),
	}
}

export function createHead<TContext extends HeadFnContext = HeadFnContext>(
	metadata: MetadataInput | ((ctx: TContext) => Metadata | Promise<Metadata>),
) {
	const head = (async (ctx: TContext) => {
		const resolved = await resolveMetadataInput(
			metadata as MetadataInput,
			ctx as HeadFnContext,
		)

		routeMetadataRegistry.set(ctx.match.routeId, resolved)

		const chain = collectMetadataChain(ctx as HeadFnContext, resolved)
		const leafRouteId = ctx.matches.at(-1)?.routeId
		const isLeafMatch = ctx.match.routeId === leafRouteId

		if (isLeafMatch) {
			const merged = mergeMetadataChain(chain)
			const resolvedTitle = resolveMergedTitle(chain)

			return metadataToHead(
				{
					...merged,
					...(resolvedTitle ? { title: resolvedTitle } : {}),
				},
				buildMetadataContext(chain, merged),
			)
		}

		return metadataToHead(
			stripTemplateOnlyTitle(resolved),
			buildMetadataContext(chain, resolved),
		)
	}) as RegisteredHeadFn

	head.__metadata = metadata as MetadataInput
	return head
}

export function defineMetadata(metadata: Metadata) {
	return createHead(metadata)
}

export function generateMetadata<
	TContext extends HeadFnContext = HeadFnContext,
>(generator: (ctx: TContext) => Metadata | Promise<Metadata>) {
	return createHead(generator)
}
