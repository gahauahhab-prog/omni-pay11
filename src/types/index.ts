export type UserRole = 'super_admin' | 'admin' | 'client';
export type AccountStatus = 'active' | 'inactive';
export type UserStatus = 'active' | 'disabled';
export type PaymentLinkStatus = 'Pending' | 'Pending Confirmation' | 'Paid' | 'Expired' | 'Rejected';
export type TransactionStatus = 'Completed' | 'Pending' | 'Flagged';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  phone: string;
  password?: string;
  created_at: string;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  ifsc_code: string;
  branch: string;
  priority: number;
  daily_limit: number;
  notes?: string;
  status: AccountStatus;
  created_at: string;
}

export interface UpiAccount {
  id: string;
  upi_id: string;
  upi_app: string;
  qr_url: string;
  priority: number;
  daily_limit: number;
  notes?: string;
  status: AccountStatus;
  created_at: string;
}

export interface Client {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  phone: string;
  password?: string;
  status: UserStatus;
  last_login_ip?: string;
  last_login_at?: string;
  created_at: string;
}

export type PaymentLinkType = 'one_time' | 'live';

export interface PaymentSubmission {
  id: string;
  amount: number;
  utr_number: string;
  screenshot_url?: string;
  submitted_at: string;
  status: PaymentLinkStatus;
  confirmed_at?: string;
  confirmed_by?: string;
  rejection_reason?: string;
  method?: string;
}

export interface PaymentLink {
  id: string;
  client_id: string;
  client_name?: string;
  amount: number;
  last_paid_amount?: number;
  status: PaymentLinkStatus;
  remarks?: string;
  link_type?: PaymentLinkType; // 'one_time' | 'live'
  is_active?: boolean; // toggle to shutdown / deactivate link
  upi_enabled?: boolean; // whether to show UPI in link
  bank_enabled?: boolean; // whether to show Bank Account transfer in link
  custom_upi_id?: string; // dedicated custom UPI ID for this link if any
  custom_bank_accounts?: BankAccount[]; // dedicated bank accounts for this link if any
  upi_account_id?: string;
  upi_id?: string;
  screenshot_url?: string;
  utr_number?: string;
  submitted_at?: string;
  submissions?: PaymentSubmission[];
  redirect_url?: string;
  confirmed_at?: string;
  confirmed_by?: string;
  rejection_reason?: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role?: string;
  action: string;
  details: string;
  ip_address?: string;
  created_at: string;
}

export interface Settings {
  id: string;
  company_name: string;
  support_email: string;
  support_phone: string;
  logo_url: string;
}

export interface Transaction {
  id: string;
  client_id?: string;
  client_name: string;
  amount: number;
  method: 'Bank Transfer' | 'UPI';
  destination_id?: string;
  destination_name: string;
  reference_no: string;
  status: TransactionStatus;
  created_at: string;
}
