import { getAuth } from '@workos/authkit-tanstack-react-start'
import type { Context, Next } from 'hono'
import { createRouteHandler } from 'uploadthing/server'
import { ourFileRouter } from '@/lib/editor/uploadthing'

export const requireEditorSession = async (c: Context, next: Next) => {
	const session = await getAuth()
	if (!session.user) {
		return c.json({ error: 'Unauthorized' }, 401)
	}

	c.set('userId', session.user.id)
	await next()
}

const uploadHandlers = createRouteHandler({ router: ourFileRouter })

export const uploadthingHandler = (c: Context) => uploadHandlers(c.req.raw)
