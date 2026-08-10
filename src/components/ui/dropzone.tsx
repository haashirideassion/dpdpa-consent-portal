/**
 * Dropzone
 *
 * Visual drag-and-drop wrapper around a file input. It owns only the
 * hidden <input type="file"> and drag-hover state — it does NOT validate
 * or upload anything. Callers pass the same `onFile` handler they already
 * use today (e.g. AttachmentField's handleFile, CorrectionRequestModal's
 * file handler) — this component just gives them a modern drop target
 * instead of a plain "Choose File" button.
 */

import { useRef, useState, type ReactNode } from "react";
import { PaperclipBoldDuotone } from "solar-icon-set";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFile: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function Dropzone({
  onFile,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  disabled = false,
  label = "Drag & drop or browse files",
  hint = "PDF, JPG, PNG — max 5MB",
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  function pick() {
    if (!disabled) inputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn("dropzone", disabled && "opacity-50 cursor-not-allowed", className)}
      data-active={active}
      onClick={pick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <PaperclipBoldDuotone size={20} className="text-muted-foreground" />
      <p className="text-xs font-medium text-foreground">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
