/**
 * CommandBar
 *
 * Global Ctrl/Cmd+K command palette — pure navigation, no business logic.
 * Lists role-aware destinations (admin items only for admin/hr_manager/dpo)
 * and jumps to the existing route via TanStack Router's navigate(). Does
 * not add any new query-parsing/deep-linking to target routes — free-text
 * "Search Employee" etc. just navigates to the relevant list page, same as
 * clicking the nav link would.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  ChartSquareBoldDuotone,
  UsersGroupTwoRoundedBoldDuotone,
  ShieldCheckBoldDuotone,
  CheckCircleBoldDuotone,
  UserBoldDuotone,
  DocumentTextBoldDuotone,
  FolderOpenBoldDuotone,
  DangerTriangleBoldDuotone,
  GraphUpBoldDuotone,
  ClipboardListBoldDuotone,
  ChartBoldDuotone,
} from "solar-icon-set";

interface CommandBarProps {
  /** Admin-only destinations are shown only when true (admin/hr_manager/dpo). */
  isAdmin: boolean;
  /** Optional controlled open state — e.g. a header "Search" button toggling it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface Destination {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const EMPLOYEE_DESTINATIONS: Destination[] = [
  { to: "/", label: "My Profile", icon: <UserBoldDuotone size={16} /> },
];

const ADMIN_DESTINATIONS: Destination[] = [
  { to: "/admin", label: "Dashboard", icon: <ChartSquareBoldDuotone size={16} /> },
  { to: "/admin/employees", label: "Employees", icon: <UsersGroupTwoRoundedBoldDuotone size={16} /> },
  { to: "/admin/requests", label: "Data Requests", icon: <DocumentTextBoldDuotone size={16} /> },
  { to: "/admin/corrections", label: "Update Queue", icon: <CheckCircleBoldDuotone size={16} /> },
  { to: "/admin/consent", label: "Consent Register", icon: <ClipboardListBoldDuotone size={16} /> },
  { to: "/admin/compliance", label: "Compliance", icon: <ShieldCheckBoldDuotone size={16} /> },
  { to: "/admin/risks", label: "Risks & DPIA", icon: <DangerTriangleBoldDuotone size={16} /> },
  { to: "/admin/inventory", label: "Data Inventory", icon: <FolderOpenBoldDuotone size={16} /> },
  { to: "/admin/breaches", label: "Breach Log", icon: <DangerTriangleBoldDuotone size={16} /> },
  { to: "/admin/reports", label: "Reports", icon: <GraphUpBoldDuotone size={16} /> },
  { to: "/admin/audit", label: "Audit Logs", icon: <ChartBoldDuotone size={16} /> },
];

export function CommandBar({ isAdmin, open: openProp, onOpenChange }: CommandBarProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const navigate = useNavigate();

  // Controlled if the caller passes `open`/`onOpenChange` (e.g. a header
  // "Search" button), otherwise falls back to fully internal state.
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  function go(to: string) {
    setOpen(false);
    navigate({ to });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search employees, requests, reports…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="My Profile">
          {EMPLOYEE_DESTINATIONS.map((d) => (
            <CommandItem key={d.to} onSelect={() => go(d.to)}>
              {d.icon}
              {d.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              {ADMIN_DESTINATIONS.map((d) => (
                <CommandItem key={d.to} onSelect={() => go(d.to)}>
                  {d.icon}
                  {d.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
