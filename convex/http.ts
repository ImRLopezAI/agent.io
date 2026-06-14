import { authKit } from './auth'
import { resend } from './resend'
import {
	type HonoWithConvex,
	HttpRouterWithHono,
} from 'convex-helpers/server/hono'
import type { ActionCtx } from './_generated/server'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { cors } from 'hono/cors'
import { Hono } from 'hono/tiny'
import { agentRequestHandler } from '@server/ai'
import type { GenericDataModel, GenericMutationCtx } from 'convex/server'

const app: HonoWithConvex<ActionCtx> = new Hono()

app.use(requestId())
app.use(logger())
app.use(cors())
app.on('POST', ['/api/agents', '/api/chat'], async (c) => {
	const request = c.req.raw
	return await agentRequestHandler(request)
})

app.post('/resend/events', async (c) => {
	return await resend.handleResendEventWebhook(c.env as unknown as RunMutationCtx, c.req.raw)
})

const http = new HttpRouterWithHono(app)
authKit.registerRoutes(http)
export default http


type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};