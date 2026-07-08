import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_shell/_base/agents/$agent/deploy/inbound/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_shell/_base/deploy/phone-number/"!</div>
}
