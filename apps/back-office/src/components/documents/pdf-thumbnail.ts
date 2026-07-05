'use client'

/**
 * Renders the first page of a PDF to a data URL for thumbnails. Reuses
 * react-pdf's bundled pdfjs instance so the worker is configured once and
 * matches the viewer's version.
 */

type ReactPdfModule = typeof import('react-pdf')

let pdfjsPromise: Promise<ReactPdfModule['pdfjs']> | null = null

function loadPdfjs() {
	pdfjsPromise ??= import('react-pdf').then((module) => {
		module.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${module.pdfjs.version}/legacy/build/pdf.worker.min.mjs`
		return module.pdfjs
	})
	return pdfjsPromise
}

export async function renderPdfThumbnail(
	url: string,
	width = 160,
): Promise<string | null> {
	const pdfjs = await loadPdfjs()
	const documentTask = pdfjs.getDocument(url)
	try {
		const pdf = await documentTask.promise
		const page = await pdf.getPage(1)
		const baseViewport = page.getViewport({ scale: 1 })
		const scale =
			(width / baseViewport.width) *
			Math.min(2, globalThis.devicePixelRatio || 1)
		const viewport = page.getViewport({ scale })
		const canvas = globalThis.document.createElement('canvas')
		canvas.width = Math.ceil(viewport.width)
		canvas.height = Math.ceil(viewport.height)
		const canvasContext = canvas.getContext('2d')
		if (!canvasContext) return null
		await page.render({ canvas, canvasContext, viewport }).promise
		return canvas.toDataURL('image/png')
	} finally {
		void documentTask.destroy()
	}
}
