import { getSessionFromRequest } from '@server/auth/native'
import type { FileRouter } from 'uploadthing/server'
import { createUploadthing, UploadThingError } from 'uploadthing/server'

const f = createUploadthing()

export const ourFileRouter = {
	editorUploader: f(['image', 'text', 'blob', 'pdf', 'video', 'audio'])
		.middleware(async ({ req }) => {
			const session = await getSessionFromRequest(req)
			if (!session) {
				throw new UploadThingError('Unauthorized')
			}
			return { userId: session.user.id }
		})
		.onUploadComplete(({ file, metadata }) => ({
			key: file.key,
			name: file.name,
			size: file.size,
			type: file.type,
			url: file.ufsUrl,
			uploadedBy: metadata.userId,
		})),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
