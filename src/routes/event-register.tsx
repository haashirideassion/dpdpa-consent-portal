import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  DataProtectionPolicyModal,
  DEFAULT_SELECTIONS,
  type ConsentSelections,
} from '@/components/DataProtectionPolicyModal';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/event-register')({
  component: EventRegisterPage,
});

const schema = z.object({
  prefix: z.string().optional(),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  is_cii_member: z.enum(['yes', 'no'], { required_error: 'Please select an option' }),
  organization_name: z.string().min(1, 'Organization name is required'),
  email: z.string().email('Valid email required'),
  mobile: z.string().optional(),
  mobile_number: z.string().min(1, 'Mobile number is required'),
  policy_accepted: z.boolean().refine((v) => v, 'You must accept the Data Protection Policy'),
});

type FormValues = z.infer<typeof schema>;

const REQUIRED_CONSENTS: (keyof ConsentSelections)[] = [
  'consent_data_processing',
  'consent_third_party',
  'consent_photo_video',
  'consent_survey_sharing',
];

function EventRegisterPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [consents, setConsents] = useState<ConsentSelections>(DEFAULT_SELECTIONS);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { policy_accepted: false },
  });

  const policyAccepted = watch('policy_accepted');

  function handleConsentConfirm(selections: ConsentSelections) {
    setConsents(selections);
    const allRequired = REQUIRED_CONSENTS.every((k) => selections[k]);
    setValue('policy_accepted', allRequired, { shouldValidate: true });
  }

  async function submitForm(values: FormValues, status: 'draft' | 'submitted') {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from('event_registrations').insert({
        prefix: values.prefix || null,
        first_name: values.first_name,
        last_name: values.last_name,
        is_cii_member: values.is_cii_member === 'yes',
        organization_name: values.organization_name,
        email: values.email,
        mobile: values.mobile || null,
        mobile_number: values.mobile_number,
        ...consents,
        status,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;
      if (status === 'submitted') {
        setSubmitted(true);
      } else {
        toast.success('Saved as draft');
      }
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl">✓</div>
          <h2 className="text-xl font-semibold text-foreground">Registration Submitted</h2>
          <p className="text-sm text-muted-foreground">
            Thank you for registering. Your data and consent preferences have been recorded in
            accordance with the Data Protection Policy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Event Registration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fields marked with <span className="text-destructive">*</span> are required.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((values) => submitForm(values, 'submitted'))}
          className="space-y-6"
        >
          {/* Name row */}
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr] gap-4">
            <div className="space-y-1">
              <Label>
                Prefix <span className="text-destructive">*</span>
              </Label>
              <Select onValueChange={(v) => setValue('prefix', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="first_name">
                First name <span className="text-destructive">*</span>
              </Label>
              <Input id="first_name" placeholder="First name" {...register('first_name')} />
              {errors.first_name && (
                <p className="text-xs text-destructive">{errors.first_name.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name">
                Last name <span className="text-destructive">*</span>
              </Label>
              <Input id="last_name" placeholder="Last name" {...register('last_name')} />
              {errors.last_name && (
                <p className="text-xs text-destructive">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          {/* CII Member */}
          <div className="space-y-2">
            <Label>
              Are you from a CII Member organisation? <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              onValueChange={(v) => setValue('is_cii_member', v as 'yes' | 'no', { shouldValidate: true })}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id="cii-yes" />
                <Label htmlFor="cii-yes" className="font-normal cursor-pointer">Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id="cii-no" />
                <Label htmlFor="cii-no" className="font-normal cursor-pointer">No</Label>
              </div>
            </RadioGroup>
            {errors.is_cii_member && (
              <p className="text-xs text-destructive">{errors.is_cii_member.message}</p>
            )}
          </div>

          {/* Organization */}
          <div className="space-y-1">
            <Label htmlFor="organization_name">
              Organization name <span className="text-destructive">*</span>
            </Label>
            <Input id="organization_name" {...register('organization_name')} />
            {errors.organization_name && (
              <p className="text-xs text-destructive">{errors.organization_name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input id="email" type="email" placeholder="Email" {...register('email')} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Mobile optional */}
          <div className="space-y-1">
            <Label htmlFor="mobile">Mobile (Optional)</Label>
            <Input id="mobile" placeholder="Mobile" {...register('mobile')} />
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            {/* Mobile Number required */}
            <div className="space-y-1">
              <Label htmlFor="mobile_number">
                Mobile Number <span className="text-destructive">*</span>
              </Label>
              <Input id="mobile_number" {...register('mobile_number')} />
              {errors.mobile_number && (
                <p className="text-xs text-destructive">{errors.mobile_number.message}</p>
              )}
            </div>

            {/* Data Protection Policy */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="policy_accepted"
                checked={policyAccepted}
                onCheckedChange={(val) =>
                  setValue('policy_accepted', val === true, { shouldValidate: true })
                }
              />
              <Label htmlFor="policy_accepted" className="font-normal text-sm cursor-pointer">
                <span className="text-destructive mr-1">*</span>
                Data Protection Policy{' '}
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  ( Review )
                </button>
              </Label>
            </div>
            {errors.policy_accepted && (
              <p className="text-xs text-destructive">{errors.policy_accepted.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={handleSubmit((values) => submitForm(values, 'draft'))}
            >
              Save as Draft
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </div>

      <DataProtectionPolicyModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        selections={consents}
        onConfirm={handleConsentConfirm}
      />
    </div>
  );
}
