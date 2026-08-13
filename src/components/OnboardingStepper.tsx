/**
 * OnboardingStepper
 *
 * Thin "Step X of N" progress indicator shared by the mandatory pre-dashboard
 * screens (Intro Video → Know Your Rights → Your Profile). Today those three
 * screens are reached via silent redirects with no visual thread tying them
 * together — each one looks like an unrelated page. This component is purely
 * presentational: it takes the current step key and renders where the user
 * is in the sequence. It does not decide routing or completion — the actual
 * "which screen next" logic in OnboardingService is untouched.
 */

import { cn } from "@/lib/utils";

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L19 7" />
    </svg>
  );
}

export interface OnboardingStep {
  key: string;
  label: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: "video", label: "Intro Video" },
  { key: "education", label: "Know Your Rights" },
  { key: "profile", label: "Your Profile" },
];

interface OnboardingStepperProps {
  currentKey: string;
  steps?: OnboardingStep[];
  className?: string;
}

export function OnboardingStepper({
  currentKey,
  steps = ONBOARDING_STEPS,
  className,
}: OnboardingStepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return (
    <div className={cn("flex items-center", className)} role="list" aria-label="Onboarding progress">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none" role="listitem">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  isDone && "bg-success text-success-foreground",
                  isCurrent && "bg-primary text-primary-foreground",
                  !isDone && !isCurrent && "bg-muted text-muted-foreground"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isDone ? <CheckGlyph /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap hidden sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 sm:mx-3 h-px flex-1 min-w-4 transition-colors",
                  isDone ? "bg-success" : "bg-border"
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
