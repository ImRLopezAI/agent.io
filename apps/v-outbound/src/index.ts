import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'

const app = new Hono()

app.get('/', (c) => {
	return c.text('Hello Hono!')
})

app.get(
	'/ws',
	upgradeWebSocket((c) => ({
		onMessage(evt, ws) {
			console.log('WebSocket message', evt.data)
			ws.send('Hello from server')
		},
		onClose(ws) {
			console.log('WebSocket closed')
		},
		onError(err, ws) {
			console.error('WebSocket error', err)
		},
		onOpen(ws) {
			console.log('WebSocket opened')
		},
	})),
)

export default {
	fetch: app.fetch,
	websocket,
	port: 3002,
}
