import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_shell/_admin/settings')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/_shell/_admin/settings"!</div>
}
