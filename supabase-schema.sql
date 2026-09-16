-- Supabase Database Schema for Payment Portal
-- Run this SQL in your Supabase project (SQL Editor -> New Query -> Run)

-- 1. Bank Accounts Table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  branch TEXT DEFAULT '',
  priority INTEGER DEFAULT 1,
  daily_limit NUMERIC DEFAULT 500000,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. UPI Accounts Table
CREATE TABLE IF NOT EXISTS public.upi_accounts (
  id TEXT PRIMARY KEY,
  upi_id TEXT NOT NULL,
  upi_app TEXT NOT NULL,
  qr_url TEXT DEFAULT '',
  priority INTEGER DEFAULT 1,
  daily_limit NUMERIC DEFAULT 100000,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_id TEXT DEFAULT '',
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) and grant access to anon & authenticated roles
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow read & write access for public/anon users of the payment portal
CREATE POLICY "Allow all read on bank_accounts" ON public.bank_accounts FOR SELECT USING (true);
CREATE POLICY "Allow all insert on bank_accounts" ON public.bank_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on bank_accounts" ON public.bank_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on bank_accounts" ON public.bank_accounts FOR DELETE USING (true);

CREATE POLICY "Allow all read on upi_accounts" ON public.upi_accounts FOR SELECT USING (true);
CREATE POLICY "Allow all insert on upi_accounts" ON public.upi_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on upi_accounts" ON public.upi_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on upi_accounts" ON public.upi_accounts FOR DELETE USING (true);

CREATE POLICY "Allow all read on activity_logs" ON public.activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow all insert on activity_logs" ON public.activity_logs FOR INSERT WITH CHECK (true);

-- Enable Realtime for instant multi-device live sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.upi_accounts;
