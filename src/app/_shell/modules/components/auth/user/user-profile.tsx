"use client"

import {
  ApiKeys,
  Pipes,
  UserProfile as WorkOsUserProfile,
  UserSecurity,
  UserSessions,
  WorkOsWidgets,
  type WorkOsWidgetsProps,
} from "@workos-inc/widgets"
import "@workos-inc/widgets/styles.css"
import { useRouteContext } from "@tanstack/react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs"
import { cn } from "@lib/utils"
import { atom, useAtom } from "jotai"
import {
  CreditCard,
  KeyRound,
  Link2,
  MonitorSmartphone,
  Shield,
  UserCircle,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { createElement, type ReactElement, type ReactNode } from "react"
import { ResponsiveDialog } from "../../ui/dialog"
import { useIsMobile } from '@/hooks/use-mobile'
/* Provides styles for Radix Themes components and its theming API */
import '@radix-ui/themes/styles.css';
/* Provides additional styles specific to WorkOS Widgets */
import '@workos-inc/widgets/styles.css';


export type UserProfileBuiltInTabId =
  | "profile"
  | "security"
  | "sessions"
  | "api-keys"
  | "pipes"

export type UserProfileTab = {
  id: string
  label: string
  icon: ReactNode
  content: ReactNode
  disabled?: boolean
}

export type UserProfileProps = {
  className?: string
  tabs?: UserProfileTab[]
  hiddenTabs?: UserProfileBuiltInTabId[]
  title?: string
  description?: string
  header?: ReactNode
  footer?: ReactNode
  widgetsTheme?: WorkOsWidgetsProps["theme"]
  queryClient?: WorkOsWidgetsProps["queryClient"]
}

export type UserProfileDialogProps = UserProfileProps & {
  trigger?: ReactElement
  dialogSize?: "sm" | "md" | "lg" | "xl" | "full"
}

export const userProfileOpenAtom = atom(false)
export const userProfileTabAtom = atom<UserProfileBuiltInTabId>("profile")

const builtInTabMeta: Record<
  UserProfileBuiltInTabId,
  { label: string; icon: LucideIcon }
> = {
  profile: { label: "Profile", icon: UserCircle },
  security: { label: "Security", icon: Shield },
  sessions: { label: "Sessions", icon: MonitorSmartphone },
  "api-keys": { label: "API keys", icon: KeyRound },
  pipes: { label: "Connected apps", icon: Link2 },
}

function buildDefaultTabs(
  accessToken: string,
  sessionId: string | undefined,
  hiddenTabs: UserProfileBuiltInTabId[] = [],
): UserProfileTab[] {
  const hidden = new Set(hiddenTabs)

  const widgets: Record<UserProfileBuiltInTabId, ReactNode> = {
    profile: <WorkOsUserProfile authToken={accessToken} className="z-100" />,
    security: <UserSecurity authToken={accessToken} className="z-100" />,
    sessions: <UserSessions authToken={accessToken} currentSessionId={sessionId ?? ""} className="z-100" />,
    "api-keys": <ApiKeys authToken={accessToken} scope="user" className="z-100" />,
    pipes: <Pipes authToken={accessToken} />,
  }

  return (Object.keys(builtInTabMeta) as UserProfileBuiltInTabId[])
    .filter((id) => !hidden.has(id))
    .map((id) => ({
      id,
      label: builtInTabMeta[id].label,
      icon: createElement(builtInTabMeta[id].icon, { className: "size-4" }),
      content: widgets[id],
    }))
}

function UserProfilePanel({
  className,
  tabs,
  hiddenTabs,
  title = "Account",
  description = "Manage your account info.",
  header,
  footer,
  widgetsTheme,
  queryClient,
}: UserProfileProps) {
  const { auth } = useRouteContext({ from: "/_shell" })
  const { resolvedTheme } = useTheme()
  const [activeTab, setActiveTab] = useAtom(userProfileTabAtom)
  const isMobile = useIsMobile()
  const resolvedTabs =
    tabs ?? buildDefaultTabs(auth.accessToken, auth.sessionId, hiddenTabs)

  const widgetTheme = widgetsTheme ?? {
    appearance: resolvedTheme === "dark" ? "dark" : "light",
  }


  return (
    <div className={cn("flex min-h-0 flex-col gap-6", className)}>
      {header ?? (
        <div className="space-y-1">
          <h2 className="font-heading font-semibold text-xl tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      )}

      <WorkOsWidgets theme={widgetTheme} queryClient={queryClient}>
        <Tabs
          orientation={isMobile ? "horizontal" : "vertical"}
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as UserProfileBuiltInTabId)
          }
          className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-8 bg-none"
        >
          <TabsList
            variant="line"
            className="flex h-auto flex-row items-stretch gap-1 p-0 w-fit"
            data-orientation="vertical"
          >
            {resolvedTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                disabled={tab.disabled}
                className="w-full justify-start gap-2 px-3 py-2"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {resolvedTabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="mt-0 outline-none"
              >
                {tab.content}
              </TabsContent>
            ))}
        </Tabs>
      </WorkOsWidgets>

      {footer}
    </div>
  )
}

export function UserProfile(props: UserProfileProps) {
  return <UserProfilePanel {...props} />
}

export function UserProfileDialog({
  trigger,
  dialogSize = "xl",
  ...profileProps
}: UserProfileDialogProps) {
  const [open, setOpen] = useAtom(userProfileOpenAtom)

  return (
    <ResponsiveDialog.Root
      open={open}
      onOpenChange={setOpen}
      defaultExpanded
    >
      {trigger ? (
        <ResponsiveDialog.Trigger>{trigger}</ResponsiveDialog.Trigger>
      ) : null}

      <ResponsiveDialog.Content size={dialogSize} className="min-h-128">
        <ResponsiveDialog.Header>
          <ResponsiveDialog.Heading>
            <ResponsiveDialog.Title>Account settings</ResponsiveDialog.Title>
          </ResponsiveDialog.Heading>

          <ResponsiveDialog.Actions>
            <ResponsiveDialog.ExpandAction />
            <ResponsiveDialog.CloseAction />
          </ResponsiveDialog.Actions>
        </ResponsiveDialog.Header>

        <ResponsiveDialog.Body padding="lg">
          <UserProfilePanel {...profileProps} />
        </ResponsiveDialog.Body>
      </ResponsiveDialog.Content>
    </ResponsiveDialog.Root>
  )
}

export function createBillingTab(content: ReactNode): UserProfileTab {
  return {
    id: "billing",
    label: "Billing",
    icon: <CreditCard className="size-4" />,
    content,
  }
}
