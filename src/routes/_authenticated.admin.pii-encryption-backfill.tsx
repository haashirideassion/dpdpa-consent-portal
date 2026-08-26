import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EncryptionService } from "@/services/encryption.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * TEMPORARY ADMIN TOOL — PII encryption backfill/verification.
 *
 * Not linked from the admin nav (src/routes/_authenticated.admin.tsx) —
 * reachable only by direct URL (/admin/pii-encryption-backfill) to an
 * already-authenticated admin/dpo session, deliberately, since this is a
 * one-time migration-support tool, not a permanent feature. Safe to delete
 * this file once the production backfill (see supabase/migrations/
 * 20260828000005_pii_encryption_backfill.sql) has been run and verified.
 *
 * SECURITY: the client-side role gate below is a UX convenience only — the
 * actual authorization boundary is enforced INSIDE
 * backfill_employee_pii_encryption()/verify_employee_pii_encryption()
 * themselves (both check public.is_staff() server-side and reject anyone
 * else with {success:false, error:'Unauthorized'}, regardless of what this
 * page does). This page never receives, computes, or displays a decrypted
 * field value — both RPCs return only counts/booleans/ids by design; there
 * is nothing here capable of rendering plaintext even by accident.
 */

export const Route = createFileRoute("/_authenticated/admin/pii-encryption-backfill")({
  head: () => ({ meta: [{ title: "PII Encryption Backfill (temporary) — DPDPA Admin" }] }),
  component: PiiEncryptionBackfillTool,
});

type BackfillResult = Awaited<ReturnType<typeof EncryptionService.runBackfillBatch>>;
type VerifyResult = Awaited<ReturnType<typeof EncryptionService.verifyBackfill>>;

function PiiEncryptionBackfillTool() {
  const { hasRole, loading: authLoading } = useAuth();
  const [running, setRunning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [afterEmployeeId, setAfterEmployeeId] = useState<string | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalEncrypted, setTotalEncrypted] = useState(0);
  const [allFailures, setAllFailures] = useState<Array<{ employee_id: string; sqlstate: string }>>([]);

  if (authLoading) return null;

  if (!hasRole("admin") && !hasRole("dpo")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
        Access denied — this tool requires the admin or dpo role. (Note: even a modified/self-granted
        client-side role will not bypass this — the RPCs re-check public.is_staff() server-side.)
      </div>
    );
  }

  async function runOneBatch() {
    setRunning(true);
    try {
      const result = await EncryptionService.runBackfillBatch(200, afterEmployeeId);
      setLastResult(result);
      if (result.success) {
        setTotalProcessed((n) => n + (result.processed ?? 0));
        setTotalEncrypted((n) => n + (result.fields_encrypted ?? 0));
        setAllFailures((prev) => [...prev, ...(result.failures ?? [])]);
        setAfterEmployeeId(result.last_employee_id ?? afterEmployeeId);
        toast.success(
          result.done
            ? "Backfill complete — all employees processed."
            : `Batch complete — ${result.processed} processed, more remain. Click "Run next batch" to continue.`,
        );
      } else {
        toast.error(result.error ?? "Backfill call failed");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Backfill call failed");
    } finally {
      setRunning(false);
    }
  }

  async function runVerify() {
    setVerifying(true);
    try {
      const result = await EncryptionService.verifyBackfill();
      setVerifyResult(result);
      if (!result.success) toast.error(result.error ?? "Verification call failed");
    } catch (err: any) {
      toast.error(err?.message ?? "Verification call failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">PII Encryption Backfill (temporary tool)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Runs public.backfill_employee_pii_encryption(200, …) in batches, then
          public.verify_employee_pii_encryption() to confirm parity. Only counts, ids, and success
          flags are ever shown here — no field value (Aadhaar, PAN, bank, health, etc.) is ever
          returned by either RPC, so nothing sensitive can appear on this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">1. Backfill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void runOneBatch()} disabled={running}>
              {running ? "Running…" : afterEmployeeId ? "Run next batch" : "Run backfill batch"}
            </Button>
            {lastResult?.done && <span className="text-xs text-emerald-600 font-medium">All employees processed</span>}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Cumulative this session — processed: {totalProcessed}, fields encrypted: {totalEncrypted}, failures: {allFailures.length}</p>
          </div>

          {lastResult && (
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
{JSON.stringify(
  {
    success: lastResult.success,
    error: lastResult.error,
    processed: lastResult.processed,
    fields_encrypted: lastResult.fields_encrypted,
    last_employee_id: lastResult.last_employee_id,
    failures: lastResult.failures,
    done: lastResult.done,
  },
  null,
  2,
)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">2. Verify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" variant="outline" onClick={() => void runVerify()} disabled={verifying}>
            {verifying ? "Checking…" : "Run verification"}
          </Button>

          {verifyResult && (
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
{JSON.stringify(verifyResult, null, 2)}
            </pre>
          )}

          <p className="text-xs text-muted-foreground">
            Expect <code>aadhaar.encrypted</code> to read 1. Note: <code>aadhaar.plaintext</code> will
            still read 1 too — this backfill intentionally never clears the plaintext column (that is a
            separate, later, explicitly-approved migration) — see the tool's header comment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
