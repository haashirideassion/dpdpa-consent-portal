import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, fieldName, oldValue, newValue, employeeName } = await req.json();

    if (!to || !to.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: {
        user: Deno.env.get("SMTP_USER") || "your-email@domain.com",
        pass: Deno.env.get("SMTP_PASS") || "your-password",
      },
    });

    // Defense in depth: escape everything interpolated into the HTML body,
    // and never render a value that wasn't actually sent. Sensitive fields
    // (Aadhaar, PAN, bank account, etc.) are filtered out by the caller
    // before oldValue/newValue ever reach this function (see
    // EmployeeService.adminOverride's isSensitive check) — this fallback is
    // what makes that hold even if a future caller forgets to filter.
    const escapeHtml = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const hasValues =
      oldValue !== undefined && oldValue !== null && newValue !== undefined && newValue !== null;

    const changeDetail = hasValues
      ? `<strong>Previous Value:</strong> <span style="text-decoration: line-through; color: #e53e3e;">${escapeHtml(oldValue) || "N/A"}</span> <br/>
        <strong>New Value:</strong> <span style="font-weight: bold; color: #38a169;">${escapeHtml(newValue) || "N/A"}</span>`
      : `<span>This field was updated. For your privacy, the value is not included in this email — please log in to the portal to view it.</span>`;

    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color:#1a73e8;">Personal Data Update Notification</h2>
      <p>Dear ${escapeHtml(employeeName || 'Employee')},</p>
      <p>
        This is to inform you that your personal data in our system has been updated by an authorized administrator.
      </p>
      <div style="background:#f5f7fa; padding:12px; border-radius:6px; margin:10px 0;">
        <strong>Updated Field:</strong> <span style="text-transform: capitalize;">${escapeHtml(String(fieldName).replace(/_/g, " "))}</span> <br/>
        ${changeDetail}
      </div>
      <p>
        If you did not request this change or believe this update is incorrect, please log in to the portal or contact the HR team immediately.
      </p>
      <p>
        You may review your updated details and manage your consent by logging into the Employee Data Consent Portal.
      </p>
      <p style="margin-top:20px;">
        Regards,<br/>
        <strong>Data Protection Team</strong><br/>
        Ideassion
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size:12px; color:#777;">
        This notification is sent in accordance with applicable data protection regulations (DPDPA).
      </p>
    </div>
    `;

    const info = await transporter.sendMail({
      from: `"DPDPA Portal" <${Deno.env.get("SMTP_USER") || "your-email@domain.com"}>`,
      to,
      subject: subject || "Update to Your Personal Data",
      html,
    });

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Failed to send email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
