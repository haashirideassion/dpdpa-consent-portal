import { useState } from 'react';
import { AltArrowDownBoldDuotone, AltArrowUpBoldDuotone } from 'solar-icon-set';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataField } from './DataField';

interface Field {
  label: string;
  key: string;
  value: string | null | undefined;
}

interface DataSectionProps {
  title: string;
  icon: React.ReactNode;
  fields: Field[];
  defaultOpen?: boolean;
}

export function DataSection({ title, icon, fields, defaultOpen = true }: DataSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader
        className="cursor-pointer select-none flex flex-row items-center justify-between py-4 px-6"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        <span className="text-muted-foreground">
          {open ? (
          <AltArrowUpBoldDuotone size={18} />
          ) : (
            <AltArrowDownBoldDuotone size={18} />
          )}
        </span>
      </CardHeader>
      {open && (
        <CardContent className="px-6 pb-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1 divide-y sm:divide-y-0">
            {fields.map((f) => (
              <DataField key={f.key} label={f.label} value={f.value} fieldKey={f.key} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
