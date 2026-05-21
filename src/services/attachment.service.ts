import { supabase } from "@/integrations/supabase/client";
import { attachmentSection } from "@/lib/attachmentConfig";

const BUCKET = "employee-documents";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export interface EmployeeAttachment {
  id: string;
  employee_id: string;
  correction_request_id: string | null;
  section_name: string;
  field_name: string;
  file_name: string;
  /** Storage path inside the "employee-documents" bucket — NOT a URL */
  file_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const AttachmentService = {
  /**
   * Returns the current active (most-recently-uploaded) attachment for
   * a specific employee field.  Returns null if none exists.
   */
  async getActive(
    employeeId: string,
    fieldName: string
  ): Promise<EmployeeAttachment | null> {
    const { data, error } = await (supabase as any)
      .from("employee_field_attachments")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("field_name", fieldName)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("AttachmentService.getActive:", error);
      return null;
    }
    return data as EmployeeAttachment | null;
  },

  /**
   * Generates a 1-hour signed URL for a private storage object.
   * Returns null on error (graceful fallback — UI hides the View link).
   */
  async getSignedUrl(filePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error("AttachmentService.getSignedUrl:", error);
      return null;
    }
    return data.signedUrl;
  },

  /**
   * Client-side validation before uploading.
   * Returns an error message string, or null if the file is valid.
   */
  validate(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed is 5 MB.`;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return "Only PDF, JPG, JPEG, PNG, and WebP files are accepted.";
    }
    return null;
  },

  /**
   * Uploads a supporting document and creates a record in
   * employee_field_attachments.
   *
   * Flow:
   *   1. Validate file (size + type).
   *   2. Upload to Supabase Storage → employee-documents/{employeeId}/{fieldName}/{ts}.{ext}
   *   3. Soft-deactivate any existing active attachment for the same field.
   *   4. Insert new record (is_active = true).
   *
   * @param file                 File selected by the user.
   * @param employeeId           Target employee's UUID.
   * @param fieldName            Field key (e.g. "aadhaar_number").
   * @param uploadedBy           auth.uid() of the uploader.
   * @param correctionRequestId  Optional — link to the parent correction request
   *                             when the upload is part of a post-consent update.
   */
  async upload(
    file: File,
    employeeId: string,
    fieldName: string,
    uploadedBy: string,
    correctionRequestId?: string
  ): Promise<EmployeeAttachment> {
    const validationError = this.validate(file);
    if (validationError) throw new Error(validationError);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const filePath = `${employeeId}/${fieldName}/${Date.now()}.${ext}`;

    // ── Upload to storage ──
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // ── Deactivate old active attachment for this field ──
    await (supabase as any)
      .from("employee_field_attachments")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("employee_id", employeeId)
      .eq("field_name", fieldName)
      .eq("is_active", true);

    // ── Insert new record ──
    const { data, error: insertError } = await (supabase as any)
      .from("employee_field_attachments")
      .insert({
        employee_id:           employeeId,
        correction_request_id: correctionRequestId ?? null,
        section_name:          attachmentSection(fieldName),
        field_name:            fieldName,
        file_name:             file.name,
        file_path:             filePath,
        mime_type:             file.type,
        file_size:             file.size,
        uploaded_by:           uploadedBy,
        is_active:             true,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to save attachment record: ${insertError.message}`);
    }

    return data as EmployeeAttachment;
  },
};
