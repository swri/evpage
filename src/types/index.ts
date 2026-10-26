// ==============================================================
// EvPage Type Definitions
// ==============================================================

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'repeater';

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormFieldValidation {
  required?: boolean;
  min?: number; // min value for number, or min items for repeater
  max?: number; // max value for number, or max items for repeater
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  accept?: string; // MIME types for file
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helperText?: string;
  validation?: FormFieldValidation;
  options?: FieldOption[]; // For select, radio, checkbox
  subFields?: FormField[]; // For repeater
  defaultValue?: any;
}

export type PriceType = 'free' | 'fixed' | 'per_participant';
export type EventStatus = 'draft' | 'open' | 'closed';
export type RegistrationStatus = 'pending' | 'verified' | 'rejected';

export interface EventPaymentInfo {
  bank_name: string;
  account_number: string;
  account_holder: string;
  qris_url?: string;
  instructions?: string;
}

export interface OrganizationSettings {
  id?: string;
  name: string;
  logo_url?: string;
  accent_color: string;
  wa_number: string;
  payment_info: EventPaymentInfo;
  updated_at?: string;
}

export interface EventContactConfig {
  enabled?: boolean;
  title?: string;
  description?: string;
  name_enabled?: boolean;
  name_required?: boolean;
  name_label?: string;
  name_placeholder?: string;
  phone_enabled?: boolean;
  phone_required?: boolean;
  phone_label?: string;
  phone_placeholder?: string;
  phone_helper?: string;
  email_enabled?: boolean;
  email_required?: boolean;
  email_label?: string;
  email_placeholder?: string;
}

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url?: string;
  location?: string;
  starts_at?: string;
  registration_deadline?: string;
  quota: number;
  price_type: PriceType;
  price_amount: number;
  prefix_code: string;
  contact_config?: EventContactConfig;
  form_schema: FormField[];
  wa_template: string;
  success_message: string;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  organizer_name?: string;
  created_by?: string;
  // Computed / aggregated fields
  total_registrations?: number;
  verified_registrations?: number;
  pending_registrations?: number;
  rejected_registrations?: number;
  total_revenue?: number;
}

export interface Registration {
  id: string;
  event_id: string;
  code: string;
  answers: Record<string, any>;
  schema_snapshot: FormField[];
  total_amount: number;
  payment_proof_path?: string;
  payment_proof_url?: string;
  status: RegistrationStatus;
  admin_note?: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  created_at: string;
  verified_at?: string;
  verified_by?: string;
  // Join fields
  event?: EventItem;
}

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  created_at: string;
}

export interface RegistrationStatusResult {
  code: string;
  event_title: string;
  contact_name: string;
  status: RegistrationStatus;
  admin_note?: string;
  total_amount: number;
  created_at: string;
  verified_at?: string;
}
