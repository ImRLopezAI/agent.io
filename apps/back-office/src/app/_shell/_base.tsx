import { ErrorComponent } from '@components/layout/errors/error'
import { NotFoundComponent } from '@components/layout/errors/not-found'
import { createFileRoute, Outlet } from '@tanstack/react-router'

import BaseLayout from '@/app/_shell/modules/components/sidebar/base'
export const Route = createFileRoute('/_shell/_base')({
	component: () => (
		<BaseLayout>
			<Outlet />
		</BaseLayout>
	),
	errorComponent: ({ error }) => (
		<BaseLayout>
			<ErrorComponent error={error} />
		</BaseLayout>
	),
	notFoundComponent: () => (
		<BaseLayout>
			<NotFoundComponent />
		</BaseLayout>
	),
})
