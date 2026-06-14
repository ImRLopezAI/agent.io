"use client"

import { Link } from "@tanstack/react-router"
import { useAuth } from "@workos/authkit-tanstack-react-start/client"
import {
  ChevronsUpDown,
  LogIn,
  LogOut,
  Settings,
  UserPlus2
} from "lucide-react"
import {
  isValidElement,
  type ReactElement,
  type ReactNode
} from "react"
import { useSetAtom } from "jotai"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@lib/utils"
import { UserAvatar } from "./user-avatar"
import { UserProfileDialog, userProfileOpenAtom } from "./user-profile"
import { UserView } from "./user-view"

/** Auth states a `UserButton` link can be visible in. */
export type UserButtonLinkVisibility =
  | "authenticated"
  | "unauthenticated"
  | "always"

/** A simple link entry rendered as a `DropdownMenuItem` in the `UserButton` menu. */
export type UserButtonLink = {
  /** Visible label. */
  label: ReactNode
  /** Destination URL. */
  href: string
  /** Optional leading icon. Sized/coloured to match built-in items. */
  icon?: ReactNode
  /** Forwarded to the underlying `DropdownMenuItem`. */
  variant?: "default" | "destructive"
  /**
   * When this link is visible based on auth state.
   * @default "always"
   */
  visibility?: UserButtonLinkVisibility
}

export type UserButtonProps = {
  className?: string
  align?: "center" | "end" | "start" | undefined
  sideOffset?: number
  size?: "default" | "icon"
  variant?:
  | "default"
  | "destructive"
  | "ghost"
  | "link"
  | "outline"
  | "secondary"
  /** Additional menu entries rendered above the built-in items. */
  links?: (UserButtonLink | ReactElement)[]
  /** Hide the built-in "Settings" link. Useful when replacing it via `links`. */
  hideSettings?: boolean
}

function renderUserLink(
  link: UserButtonLink | ReactElement,
  fallbackKey: string
): ReactNode {
  if (isValidElement(link)) return link

  const { label, href, icon, variant } = link
  return (
    <DropdownMenuItem
      key={fallbackKey}
      variant={variant}
      render={<Link to={href} />}
    >
      {icon}
      {label}
    </DropdownMenuItem>
  )
}

/**
 * Render a user dropdown button that shows user info, settings, and authentication actions.
 */
export function UserButton({
  className,
  align,
  sideOffset,
  size = "default",
  variant = "ghost",
  links,
  hideSettings = false
}: UserButtonProps) {
  const { user, loading, signOut } = useAuth()
  const openProfile = useSetAtom(userProfileOpenAtom)

  const userLinks = links?.flatMap((link, index) => {
    if (!isValidElement(link)) {
      const visibility = link.visibility ?? "always"
      if (visibility === "authenticated" && !user) return []
      if (visibility === "unauthenticated" && user) return []
    }
    return [renderUserLink(link, `user-button-link-${index.toString()}`)]
  })

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(size === "icon" && "rounded-full")}
        render={size === "icon" ? (
          <Button size="icon">
            <UserAvatar className={className} />
          </Button>
        ) : (
          <Button
            variant={variant}
            className={cn("h-auto py-2.5 font-normal", className)}
            size="lg"
          >
            {user || loading ? (
              <UserView isPending={loading && !user} />
            ) : (
              <>
                <UserAvatar />

                <div className="grid flex-1 text-left text-sm leading-tight">
                  Account
                </div>
              </>
            )}

            <ChevronsUpDown className="ml-auto size-4" />
          </Button>
        )}
      />

      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-40 max-w-[48svw] md:min-w-56"
        sideOffset={sideOffset}
        align={align}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {user && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal text-sm">
                <UserView />
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
          </>
        )}

        {user ? (
          <>
            {userLinks}

            {!hideSettings && (
              <DropdownMenuItem onClick={() => openProfile(true)}>
                <Settings className="text-muted-foreground" />
                Settings
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="text-muted-foreground" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {userLinks}

            <DropdownMenuItem render={<Link to="/auth/sign-in" />}>
              <LogIn className="text-muted-foreground" />
              Sign in
            </DropdownMenuItem>

            <DropdownMenuItem render={<Link to="/auth/sign-up" />}>
              <UserPlus2 className="text-muted-foreground" />
              Sign up
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <UserProfileDialog />
    </>
  )
}
