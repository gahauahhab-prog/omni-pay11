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
  created_at: string;
}

export interface PaymentLink {
  id: string;
  client_id: string;
  client_name?: string;
  amount: number;
  status: PaymentLinkStatus;
  remarks?: string;
  upi_account_id?: string;
  upi_id?: string;
  screenshot_url?: string;
  utr_number?: string;
  submitted_at?: string;
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
