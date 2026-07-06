import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_shell/_base/settings/kb/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_shell/_base/settings/tools/kb/"!</div>
}
