import { createFileRoute } from '@tanstack/react-router'
import { createHead } from '#/app/_shell/modules/utils/metadata'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/_shell/_base/')({
  component: RouteComponent,
  head: createHead({
    title: "Crew"
  }),
})

function RouteComponent() {
  const { $rpc } = Route.useRouteContext()
  const { data, isLoading } = useQuery($rpc.health.queryOptions({}))
  return <div>{isLoading ? 'Loading...' : data?.message}</div>
}
