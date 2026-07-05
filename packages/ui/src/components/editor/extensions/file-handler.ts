import type { Editor } from '@tiptap/core'
import { FileHandler } from '@tiptap/extension-file-handler'

import { handleImageUpload } from '#/lib/tiptap-utils'

export const FILE_HANDLER_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
] as const

function extractImageUrlsFromHtml(html: string): string[] {
	if (typeof DOMParser === 'undefined') return []

	const doc = new DOMParser().parseFromString(html, 'text/html')
	return [...doc.querySelectorAll('img[src]')]
		.map((img) => img.getAttribute('src')?.trim() ?? '')
		.filter(Boolean)
}

async function insertImage(
	editor: Editor,
	file: File,
	pos?: number,
): Promise<number | undefined> {
	const url = await handleImageUpload(file)

	if (typeof pos === 'number') {
		const node = editor.schema.nodes.image?.create({ src: url })
		if (!node) return pos

		editor.chain().focus().insertContentAt(pos, node).run()
		return pos + node.nodeSize
	}

	editor.chain().focus().setImage({ src: url }).run()
	return undefined
}

function insertImageUrl(
	editor: Editor,
	url: string,
	pos?: number,
): number | undefined {
	if (typeof pos === 'number') {
		const node = editor.schema.nodes.image?.create({ src: url })
		if (!node) return pos

		editor.chain().focus().insertContentAt(pos, node).run()
		return pos + node.nodeSize
	}

	editor.chain().focus().setImage({ src: url }).run()
	return undefined
}

async function handlePastedFiles(
	editor: Editor,
	files: File[],
	pasteContent?: string,
) {
	const htmlImageUrls = pasteContent
		? extractImageUrlsFromHtml(pasteContent)
		: []

	if (files.length === 0) {
		for (const url of htmlImageUrls) {
			insertImageUrl(editor, url)
		}
		return
	}

	for (const [index, file] of files.entries()) {
		try {
			const htmlUrl = htmlImageUrls[index]
			const shouldUseHtmlUrl = file.type === 'image/gif' && htmlUrl

			if (shouldUseHtmlUrl) {
				insertImageUrl(editor, htmlUrl)
				continue
			}

			await insertImage(editor, file)
		} catch (error) {
			console.error('Image paste failed:', error)
		}
	}
}

async function handleDroppedFiles(editor: Editor, files: File[], pos: number) {
	let insertPos = pos

	for (const file of files) {
		try {
			const nextPos = await insertImage(editor, file, insertPos)
			if (typeof nextPos === 'number') {
				insertPos = nextPos
			}
		} catch (error) {
			console.error('Image drop failed:', error)
		}
	}
}

export function createFileHandler() {
	return FileHandler.configure({
		allowedMimeTypes: [...FILE_HANDLER_MIME_TYPES],
		onDrop: (editor, files, pos) => {
			void handleDroppedFiles(editor, files, pos)
		},
		onPaste: (editor, files, pasteContent) => {
			void handlePastedFiles(editor, files, pasteContent)
		},
	})
}
