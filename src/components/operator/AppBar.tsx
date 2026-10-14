/**
 * The app shell's top: a brand strip, the bar (wordmark, organisation, data
 * status, account) and the page tabs.
 */
import { Link } from "@tanstack/react-router";
import { Building2, ChevronDown, Info, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { dayLabel } from "./primitives";

export type NavItem = { to: string; label: string; exact: boolean; badge?: number };

export function AppBar({
  orgName,
  sectorLabel,
  dataTo,
  email,
  nav,
  onSignOut,
  signingOut,
}: {
  orgName: string | null;
  sectorLabel: string | null;
  dataTo: string | null;
  email: string | null;
  nav: NavItem[];
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const initials = (email ?? "?").replace(/@.*/, "").slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="brand-strip" aria-hidden="true" />
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-4 px-6">
        <Link
          to="/admin"
          search={true}
          className="flex shrink-0 items-center"
          aria-label="Cicely — Overview"
        >
          <img src="/brand/cicely-wordmark.svg" alt="Cicely" className="h-[18px] w-auto" />
        </Link>
        <span className="h-6 w-px bg-line" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-surface-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-line bg-surface">
              <Building2 aria-hidden="true" className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-[0.875rem] font-semibold">{orgName ?? " "}</span>
              {sectorLabel && sectorLabel.toLowerCase() !== orgName?.toLowerCase() && (
                <span className="block text-[0.6875rem] text-ink/70">{sectorLabel}</span>
              )}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 text-ink/70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel className="text-[0.6875rem] uppercase tracking-wider text-ink/70">
              Organisations
            </DropdownMenuLabel>
            <DropdownMenuItem className="font-semibold">{orgName}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-3">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-dandelion px-2.5 py-1 text-[0.75rem] font-semibold"
                >
                  <Info aria-hidden="true" className="size-3.5" />
                  Demo data
                </span>
              </TooltipTrigger>
              <TooltipContent>Synthetic data generated for this demonstration.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {dataTo && (
            <span className="hidden text-[0.8125rem] text-ink/70 sm:inline">
              Data to {dayLabel(dataTo)}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account"
              className="flex size-8 items-center justify-center rounded-full bg-mint text-[0.75rem] font-semibold"
            >
              {initials}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-[0.6875rem] uppercase tracking-wider text-ink/70">
                  Signed in as
                </span>
                <span className="block truncate text-[0.8125rem]">{email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut} disabled={signingOut}>
                <LogOut aria-hidden="true" className="size-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <nav aria-label="Dashboard" className="mx-auto flex h-11 max-w-[88rem] items-end gap-1 px-6">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            search={true}
            activeOptions={{ exact: n.exact }}
            activeProps={{ className: "border-ink text-ink", "aria-current": "page" }}
            inactiveProps={{ className: "border-transparent text-ink/70 hover:text-ink" }}
            className="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[0.875rem] font-semibold"
          >
            {n.label}
            {n.badge ? (
              <span className="rounded-full bg-bubblegum px-1.5 text-[0.6875rem] leading-[1.125rem]">
                {n.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}
