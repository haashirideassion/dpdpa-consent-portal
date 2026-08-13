/**
 * ThemeToggle
 *
 * Light / Dark / System switcher for the shared authenticated header.
 * Purely presentational wiring around useTheme — no business logic.
 */

import { SunBoldDuotone, MoonBoldDuotone, MonitorBoldDuotone } from "solar-icon-set";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunBoldDuotone size={15} /> },
  { value: "dark", label: "Dark", icon: <MoonBoldDuotone size={15} /> },
  { value: "system", label: "System", icon: <MonitorBoldDuotone size={15} /> },
];

export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          title="Theme"
        >
          {resolvedTheme === "dark" ? (
            <MoonBoldDuotone size={18} />
          ) : (
            <SunBoldDuotone size={18} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setPreference(opt.value)}
            className={cn("gap-2", preference === opt.value && "text-primary font-medium")}
          >
            {opt.icon}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
