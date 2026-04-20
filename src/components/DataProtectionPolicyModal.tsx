import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

export interface ConsentSelections {
  consent_marketing: boolean;
  consent_data_processing: boolean;
  consent_third_party: boolean;
  consent_photo_video: boolean;
  consent_survey_sharing: boolean;
  consent_whatsapp_alerts: boolean;
  consent_networking: boolean;
  consent_rights_acknowledged: boolean;
}

const CONSENT_ITEMS: {
  key: keyof ConsentSelections;
  required: boolean;
  text: string;
}[] = [
  {
    key: 'consent_marketing',
    required: false,
    text: 'I consent to receiving communication from CII regarding updates, upcoming events, publications, policy alerts, membership renewals, CII Elections, business services and other CII related activities via Email, SMS, WhatsApp or telephone. I understand that my name, mobile number, email ID may be shared with authorised platforms or delivery partners solely for the purpose of message transmission and that I may opt out of such communication at any time through sending email to privacy@cii.in. This consent does not create any obligation on CII to provide participation, membership, or engagement opportunities.',
  },
  {
    key: 'consent_data_processing',
    required: true,
    text: 'I consent to the Confederation of Indian Industry (CII) collecting, processing and storing the personal information (including name, email ID, mobile number, organisation, designation, postal address and any other information submitted in this form) and responses submitted by me through this online form. I understand that this information will be used solely for the purpose for which it is being collected, including analysis, reporting, research, policy inputs or programme development, depending on the nature of this form.',
  },
  {
    key: 'consent_third_party',
    required: true,
    text: 'I understand that if I am providing information about a third party (such as colleagues, nominees, references or beneficiaries), I confirm that I am authorised to do so or have obtained their consent before sharing such details with CII.',
  },
  {
    key: 'consent_photo_video',
    required: true,
    text: 'I consent to CII using photographs, video recordings or testimonials voluntarily submitted by me through this form for communication, reporting, publication or promotional purposes on CII platforms including website, print publications, social media and other external channels.',
  },
  {
    key: 'consent_survey_sharing',
    required: true,
    text: 'I consent to CII sharing my survey inputs or form responses, either in anonymised or identified format, with project partners, sponsors, academic institutions, research collaborators or government departments if required for further analysis or programme implementation. I understand that this sharing will be purpose-specific and aligned with the context of the survey/form.',
  },
  {
    key: 'consent_whatsapp_alerts',
    required: false,
    text: 'By opting in, I agree to receive WhatsApp, email and/or SMS alerts from CII regarding this form submission and other related engagements.',
  },
  {
    key: 'consent_networking',
    required: false,
    text: 'I consent to my contact identifiers such as name, organisation, designation and business interests being used for curated networking or knowledge-sharing activities facilitated by CII. I understand that my email, phone number and postal address will not be displayed publicly unless I separately authorise such disclosure.',
  },
  {
    key: 'consent_rights_acknowledged',
    required: false,
    text: 'I understand that I may request access, correction, withdrawal of consent or deletion of my personal data, and may also raise any grievance regarding its processing, or withdraw my consent for one or more of the above purposes, and that CII will process such requests in accordance with applicable law. Requests may be emailed to privacy@cii.in.',
  },
];

const DEFAULT_SELECTIONS: ConsentSelections = {
  consent_marketing: false,
  consent_data_processing: true,
  consent_third_party: true,
  consent_photo_video: true,
  consent_survey_sharing: true,
  consent_whatsapp_alerts: false,
  consent_networking: false,
  consent_rights_acknowledged: false,
};

interface DataProtectionPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selections: ConsentSelections;
  onConfirm: (selections: ConsentSelections) => void;
}

export function DataProtectionPolicyModal({
  open,
  onOpenChange,
  selections,
  onConfirm,
}: DataProtectionPolicyModalProps) {
  const [local, setLocal] = useState<ConsentSelections>(selections);

  function toggle(key: keyof ConsentSelections) {
    setLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleConfirm() {
    onConfirm(local);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="bg-[#1a3a6b] text-white px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-white text-lg font-semibold">
            Data Protection Policy
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/60">
                <th className="w-12 border border-border p-3" />
                <th className="border border-border p-3 text-left text-sm font-semibold">
                  Consent
                </th>
              </tr>
            </thead>
            <tbody>
              {CONSENT_ITEMS.map((item) => (
                <tr key={item.key} className="border-b border-border">
                  <td className="border border-border p-3 text-center align-top">
                    <Checkbox
                      checked={local[item.key]}
                      onCheckedChange={() => toggle(item.key)}
                      className="mt-1"
                    />
                  </td>
                  <td className="border border-border p-4 text-sm leading-relaxed text-foreground">
                    {item.required && (
                      <span className="text-destructive font-semibold mr-1">*</span>
                    )}
                    {item.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <Button onClick={handleConfirm}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_SELECTIONS };
