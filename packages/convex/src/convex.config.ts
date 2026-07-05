import resend from '@convex-dev/resend/convex.config'
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
	env: {
		AI_GATEWAY_API_KEY: v.string(),
		EMAIL_FROM: v.string(),
		RESEND_API_KEY: v.string(),
		RESEND_WEBHOOK_SECRET: v.string(),
		WORKOS_API_KEY: v.string(),
		WORKOS_CLIENT_ID: v.string(),
		WORKOS_WEBHOOK_SECRET: v.string(),
	},
})
app.use(workOSAuthKit)
app.use(resend)
export default app
