import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ShieldCheckBoldDuotone } from "solar-icon-set";

interface DpdpaInfoProps {
  onDismiss: () => void;
}

export function DpdpaInfo({ onDismiss }: DpdpaInfoProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckBoldDuotone size={20} color="var(--primary)" />
            <CardTitle className="text-base font-semibold text-primary">
              About the Digital Personal Data Protection Act, 2023
            </CardTitle>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          India&apos;s landmark data privacy law that gives you rights over your personal data.
          Please read before reviewing your information.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {INFO_POINTS.map((point) => (
              <div
                key={point.title}
                className="rounded-lg bg-background/60 border border-border/50 p-3"
              >
                <p className="text-xs font-semibold text-foreground mb-1">{point.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{point.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <span className="font-semibold">Your right to withdraw: </span>
              You may revoke consent at any time by contacting your HR or Compliance team.
              Withdrawal does not affect data processed on other lawful bases (e.g., legal
              obligations, employment contract).
            </p>
          </div>
        </CardContent>
      )}

      <CardContent className={expanded ? "pt-3" : "pt-0"}>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onDismiss} className="shrink-0">
            I understand, proceed
          </Button>
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-primary underline underline-offset-2 hover:no-underline transition-all"
            >
              Read more about DPDPA
            </button>
          )}
          {expanded && (
            <p className="text-xs text-muted-foreground">
              Enacted by Parliament of India · Effective 2023
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const INFO_POINTS = [
  {
    title: "What is DPDPA?",
    body: "The Digital Personal Data Protection Act, 2023 is India's comprehensive data privacy law governing how organisations collect, store, and process personal data of individuals.",
  },
  {
    title: "Your Rights as a Data Principal",
    body: "You have the right to access your data, correct inaccuracies, and withdraw consent. You may also nominate a person to exercise these rights on your behalf.",
  },
  {
    title: "Why Your Consent Matters",
    body: "Consent is one of the lawful bases for processing personal data under DPDPA. Your explicit consent ensures the organisation is compliant with the Act.",
  },
  {
    title: "Data Fiduciary Obligations",
    body: "Your employer (Data Fiduciary) must process only the data necessary for stated purposes, maintain accuracy, and implement appropriate security safeguards.",
  },
];
