import { Profile, BankAccount, UpiAccount, Client, PaymentLink, ActivityLog, Settings, Transaction } from '../types';

export const INITIAL_SUPER_ADMIN: Profile = {
  id: 'usr_superadmin_01',
  full_name: 'Sudheer Jain',
  email: 'sudheerjain887@gmail.com',
  password: 'Sudheer@1010',
  role: 'super_admin',
  status: 'active',
  phone: '+91 98200 11010',
  created_at: '2026-09-01T09:00:00.000Z',
};

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'cli_01',
    user_id: 'usr_client_01',
    full_name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '+91 98765 43210',
    password: 'Client@123',
    status: 'active',
    created_at: '2026-09-05T10:30:00.000Z',
  },
  {
    id: 'cli_02',
    user_id: 'usr_client_02',
    full_name: 'Amit Patel',
    email: 'amit.patel@example.com',
    phone: '+91 98234 56789',
    password: 'Client@123',
    status: 'active',
    created_at: '2026-09-07T14:15:00.000Z',
  },
  {
    id: 'cli_03',
    user_id: 'usr_client_03',
    full_name: 'Priya Verma',
    email: 'priya.verma@example.com',
    phone: '+91 97123 45678',
    password: 'Client@123',
    status: 'active',
    created_at: '2026-09-10T11:45:00.000Z',
  },
];

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank_01',
    bank_name: 'HDFC Bank',
    account_holder: 'Payment Portal Pvt Ltd',
    account_number: '50200012345678',
    ifsc_code: 'HDFC0001234',
    branch: 'Nariman Point, Mumbai',
    priority: 1,
    daily_limit: 500000,
    notes: 'Primary corporate collection account for RTGS / NEFT / IMPS transfers',
    status: 'active',
    created_at: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'bank_02',
    bank_name: 'ICICI Bank',
    account_holder: 'Payment Portal Pvt Ltd',
    account_number: '001105009876',
    ifsc_code: 'ICIC0000011',
    branch: 'Connaught Place, New Delhi',
    priority: 2,
    daily_limit: 1000000,
    notes: 'Secondary operational current account for high-value client settlements',
    status: 'active',
    created_at: '2026-09-03T11:00:00.000Z',
  },
  {
    id: 'bank_03',
    bank_name: 'State Bank of India',
    account_holder: 'Payment Portal Pvt Ltd',
    account_number: '334455667788',
    ifsc_code: 'SBIN0000456',
    branch: 'Bandra Kurla Complex, Mumbai',
    priority: 3,
    daily_limit: 300000,
    notes: 'Reserve account under quarterly maintenance',
    status: 'inactive',
    created_at: '2026-09-04T12:00:00.000Z',
  },
];

export const INITIAL_UPI_ACCOUNTS: UpiAccount[] = [
  {
    id: 'upi_01',
    upi_id: 'payments@upi',
    upi_app: 'Google Pay',
    qr_url: '',
    priority: 1,
    daily_limit: 100000,
    notes: 'Default merchant virtual payment address for instant smartphone scan',
    status: 'active',
    created_at: '2026-09-02T10:30:00.000Z',
  },
  {
    id: 'upi_02',
    upi_id: 'collect@paytm',
    upi_app: 'Paytm',
    qr_url: '',
    priority: 2,
    daily_limit: 200000,
    notes: 'Direct nodal payment gateway collection UPI ID',
    status: 'active',
    created_at: '2026-09-03T14:30:00.000Z',
  },
  {
    id: 'upi_03',
    upi_id: 'billing@phonepe',
    upi_app: 'PhonePe',
    qr_url: '',
    priority: 3,
    daily_limit: 150000,
    notes: 'Backup settlement handle - currently offline',
    status: 'inactive',
    created_at: '2026-09-05T16:00:00.000Z',
  },
];

export const INITIAL_SETTINGS: Settings = {
  id: 'set_01',
  company_name: 'Payment Portal',
  support_email: 'support@paymentportal.com',
  support_phone: '+91 9999999999',
  logo_url: '',
};

export const INITIAL_PAYMENT_LINKS: PaymentLink[] = [];

export const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];
