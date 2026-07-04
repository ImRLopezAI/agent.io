import { agentRequestHandler } from '@server/ai'
import {
	type HonoWithConvex,
	HttpRouterWithHono,
} from 'convex-helpers/server/hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'

import type { ActionCtx } from './_generated/server'
import { authKit } from './auth'
import { resend } from './resend'

const app: HonoWithConvex<ActionCtx> = new Hono()

app.use(requestId())
app.use(cors())
app.on('POST', ['/api/agents', '/api/chat'], async (c) => {
	const request = c.req.raw
	return await agentRequestHandler(request)
})

app.post('/resend/events', async (c) => {
	return await resend.handleResendEventWebhook(c.env, c.req.raw)
})

const http = new HttpRouterWithHono(app)
authKit.registerRoutes(http)
export default http
