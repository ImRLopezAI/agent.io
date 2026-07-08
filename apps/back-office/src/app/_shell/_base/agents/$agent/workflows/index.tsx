import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_shell/_base/agents/$agent/workflows/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_shell/_base/agents/$agent/workflows/"!</div>
}
