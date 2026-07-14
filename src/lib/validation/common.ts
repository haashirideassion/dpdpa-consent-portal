import { z } from "zod";

// Same phone pattern already used for manual validation in
// _authenticated.admin.employees.index.tsx — reused here rather than reinvented,
// so phone validation behaves identically everywhere it's applied.
const PHONE_REGEX = /^\+?[\d\s\-()]{7,15}$/;

/** A required, trimmed text field. Optionally enforce a max length. */
export function requiredText(label: string, opts?: { max?: number }) {
  let schema = z.string().trim().min(1, `${label} is required.`);
  if (opts?.max) {
    schema = schema.max(opts.max, `${label} must be ${opts.max} characters or fewer.`);
  }
  return schema;
}

/** An optional, trimmed text field with no minimum length. */
export function optionalText(opts?: { max?: number }) {
  let schema = z.string().trim();
  if (opts?.max) {
    schema = schema.max(opts.max, `Must be ${opts.max} characters or fewer.`);
  }
  return schema.optional();
}

/** An email field. Pass `required: false` for an optional email (e.g. a secondary contact). */
export function emailField(label = "Email", opts?: { required?: boolean }) {
  const base = z.string().trim().email(`${label} must be a valid email address.`);
  if (opts?.required === false) {
    return z.union([base, z.literal("")]);
  }
  return z.string().trim().min(1, `${label} is required.`).pipe(base);
}

/** A phone number field, validated against the same pattern used elsewhere in the app. */
export function phoneField(label = "Phone number", opts?: { required?: boolean }) {
  const base = z.string().trim().regex(PHONE_REGEX, `${label} must be a valid phone number.`);
  if (opts?.required === false) {
    return z.union([base, z.literal("")]);
  }
  return z.string().trim().min(1, `${label} is required.`).pipe(base);
}

/**
 * A numeric field backed by an HTML <input type="number">/text string.
 * Kept as a `string` schema (via superRefine) rather than `z.coerce.number()` + `.transform()` —
 * a resolver that transforms the type makes Zod's inferred type diverge from what
 * react-hook-form actually stores (the raw string from the input), which breaks the
 * types on <Input value={field.value} onChange={field.onChange}>. Numeric parsing for
 * the actual API payload happens at submission time, same as the pre-migration code did.
 */
export function numericField(
  label: string,
  opts?: { min?: number; max?: number; integer?: boolean; required?: boolean }
) {
  const { min, max, integer = false, required = true } = opts ?? {};

  return z.string().superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      if (required) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required.` });
      }
      return;
    }

    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number.` });
      return;
    }
    if (integer && !Number.isInteger(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number.` });
    }
    if (min !== undefined && num < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be at least ${min}.` });
    }
    if (max !== undefined && num > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be at most ${max}.` });
    }
  });
}
