/**
 * Issue descriptions are stored as Markdown strings so rich formatting
 * survives reloads. Plain-text legacy values still load correctly.
 */

export function normalizeDescriptionMarkdown(description?: string): string {
	if (!description) return ''
	return description.replace(/\r\n/g, '\n')
}

export function markdownDescriptionOrUndefined(
	markdown: string,
): string | undefined {
	const normalized = normalizeDescriptionMarkdown(markdown).trim()
	if (!normalized) return undefined
	if (normalized === '&nbsp;' || normalized === '\u00a0') return undefined
	return normalizeDescriptionMarkdown(markdown)
}
