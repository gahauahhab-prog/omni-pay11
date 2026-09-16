import {
  Profile,
  BankAccount,
  UpiAccount,
  Client,
  PaymentLink,
  ActivityLog,
  Settings,
  Transaction,
} from '../types';
import {
  INITIAL_SUPER_ADMIN,
  INITIAL_CLIENTS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_UPI_ACCOUNTS,
  INITIAL_SETTINGS,
  INITIAL_PAYMENT_LINKS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_TRANSACTIONS,
} from './seedData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_KEYS = {
  PROFILES: 'payment_portal_profiles',
  BANK_ACCOUNTS: 'payment_portal_bank_accounts',
  UPI_ACCOUNTS: 'payment_portal_upi_accounts',
  CLIENTS: 'payment_portal_clients',
  PAYMENT_LINKS: 'payment_portal_payment_links',
  ACTIVITY_LOGS: 'payment_portal_activity_logs',
  SETTINGS: 'payment_portal_settings',
  TRANSACTIONS: 'payment_portal_transactions',
};

// Safe localStorage helper
function getStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error reading ${key} from storage:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving ${key} to storage:`, e);
  }
}

// Database Service class
class DatabaseService {
  private initialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.initialized) return;

    // Seed Profiles if missing
    const existingProfiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, []);
    if (existingProfiles.length === 0) {
      setStored(STORAGE_KEYS.PROFILES, [INITIAL_SUPER_ADMIN]);
    } else {
      // Ensure default super admin always exists
      const hasSuper = existingProfiles.some((p) => p.email === INITIAL_SUPER_ADMIN.email);
      if (!hasSuper) {
        setStored(STORAGE_KEYS.PROFILES, [INITIAL_SUPER_ADMIN, ...existingProfiles]);
      }
    }

    // Seed Clients if missing
    const existingClients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    if (existingClients.length === 0) {
      setStored(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
    }

    // Seed Bank Accounts
    const existingBanks = getStored<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
    if (existingBanks.length === 0) {
      setStored(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS);
    }

    // Seed UPI Accounts
    const existingUpi = getStored<UpiAccount[]>(STORAGE_KEYS.UPI_ACCOUNTS, []);
    if (existingUpi.length === 0) {
      setStored(STORAGE_KEYS.UPI_ACCOUNTS, INITIAL_UPI_ACCOUNTS);
    }

    // Seed Settings
    const existingSettings = getStored<Settings | null>(STORAGE_KEYS.SETTINGS, null);
    if (!existingSettings) {
      setStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    }

    // Seed Payment Links
    const existingLinks = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    if (existingLinks.length === 0) {
      setStored(STORAGE_KEYS.PAYMENT_LINKS, INITIAL_PAYMENT_LINKS);
    }

    // Seed Activity Logs
    const existingLogs = getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
    if (existingLogs.length === 0) {
      setStored(STORAGE_KEYS.ACTIVITY_LOGS, INITIAL_ACTIVITY_LOGS);
    }

    // Seed Transactions
    const existingTx = getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
    if (existingTx.length === 0) {
      setStored(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
    }

    this.initialized = true;
    // Trigger background cloud sync if Supabase is configured
    this.syncAccountsFromCloud().catch(() => {});
  }

  private notifyChange(type: string) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('portal_accounts_updated', { detail: { type, time: Date.now() } })
      );
      try {
        const channel = new BroadcastChannel('payment_portal_channel');
        channel.postMessage({ type, time: Date.now() });
        channel.close();
      } catch {
        // Fallback for environments without BroadcastChannel
      }
    }
  }

  private async safeSupabaseCall(builder: PromiseLike<unknown>) {
    try {
      await builder;
    } catch (e) {
      console.warn('Supabase operation warning:', e);
    }
  }

  public async syncAccountsFromCloud(): Promise<{ banks: BankAccount[]; upis: UpiAccount[] }> {
    let localBanks = this.getBankAccounts();
    let localUpis = this.getUpiAccounts();

    if (isSupabaseConfigured() && supabase) {
      try {
        const [banksRes, upisRes] = await Promise.all([
          supabase.from('bank_accounts').select('*').order('priority', { ascending: true }),
          supabase.from('upi_accounts').select('*').order('priority', { ascending: true }),
        ]);

        if (!banksRes.error && banksRes.data && banksRes.data.length > 0) {
          localBanks = banksRes.data as BankAccount[];
          setStored(STORAGE_KEYS.BANK_ACCOUNTS, localBanks);
        } else if (localBanks.length > 0 && (!banksRes.data || banksRes.data.length === 0)) {
          for (const b of localBanks) {
            await this.safeSupabaseCall(supabase.from('bank_accounts').upsert(b));
          }
        }

        if (!upisRes.error && upisRes.data && upisRes.data.length > 0) {
          localUpis = upisRes.data as UpiAccount[];
          setStored(STORAGE_KEYS.UPI_ACCOUNTS, localUpis);
        } else if (localUpis.length > 0 && (!upisRes.data || upisRes.data.length === 0)) {
          for (const u of localUpis) {
            await this.safeSupabaseCall(supabase.from('upi_accounts').upsert(u));
          }
        }
      } catch (err) {
        console.warn('Supabase sync skipped/failed:', err);
      }
    }

    return { banks: localBanks, upis: localUpis };
  }

  // Activity Logs
  public async logAction(
    userName: string,
    action: string,
    details: string,
    userId: string = 'system',
    userRole: string = 'admin'
  ): Promise<ActivityLog> {
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action,
      details,
      created_at: new Date().toISOString(),
    };

    const logs = getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
    const updated = [newLog, ...logs];
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, updated);

    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.from('activity_logs').insert([
          {
            user_id: userId,
            action,
            details,
            created_at: newLog.created_at,
          },
        ]);
      } catch (err) {
        console.warn('Supabase log insert skipped:', err);
      }
    }

    return newLog;
  }

  public getActivityLogs(): ActivityLog[] {
    return getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
  }

  // Bank Accounts
  public getBankAccounts(): BankAccount[] {
    const list = getStored<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
    return list.sort((a, b) => a.priority - b.priority);
  }

  public getActiveBankAccounts(): BankAccount[] {
    return this.getBankAccounts().filter((a) => a.status === 'active');
  }

  public async saveBankAccount(
    account: Partial<BankAccount>,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<BankAccount> {
    const accounts = getStored<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
    let saved: BankAccount;

    if (account.id) {
      // Edit
      const index = accounts.findIndex((a) => a.id === account.id);
      if (index === -1) throw new Error('Bank account not found');
      saved = {
        ...accounts[index],
        ...account,
      } as BankAccount;
      accounts[index] = saved;

      await this.logAction(
        actorName,
        'Bank Edited',
        `Modified ${saved.bank_name} (${saved.account_number})`,
        actorId
      );
    } else {
      // Create
      saved = {
        id: `bank_${Date.now()}`,
        bank_name: account.bank_name || '',
        account_holder: account.account_holder || '',
        account_number: account.account_number || '',
        ifsc_code: (account.ifsc_code || '').toUpperCase(),
        branch: account.branch || '',
        priority: Number(account.priority) || accounts.length + 1,
        daily_limit: Number(account.daily_limit) || 500000,
        notes: account.notes || '',
        status: account.status || 'active',
        created_at: new Date().toISOString(),
      };
      accounts.push(saved);

      await this.logAction(
        actorName,
        'Bank Added',
        `Added new bank account ${saved.bank_name} - ${saved.account_number}`,
        actorId
      );
    }

    setStored(STORAGE_KEYS.BANK_ACCOUNTS, accounts);
    this.notifyChange('BANK_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(supabase.from('bank_accounts').upsert(saved));
    }

    return saved;
  }

  public async deleteBankAccount(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<boolean> {
    const accounts = getStored<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
    const target = accounts.find((a) => a.id === id);
    if (!target) return false;

    const filtered = accounts.filter((a) => a.id !== id);
    setStored(STORAGE_KEYS.BANK_ACCOUNTS, filtered);
    this.notifyChange('BANK_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(supabase.from('bank_accounts').delete().eq('id', id));
    }

    await this.logAction(
      actorName,
      'Bank Deleted',
      `Deleted account ${target.bank_name} (${target.account_number})`,
      actorId
    );
    return true;
  }

  public async toggleBankAccountStatus(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<BankAccount | null> {
    const accounts = getStored<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
    const target = accounts.find((a) => a.id === id);
    if (!target) return null;

    target.status = target.status === 'active' ? 'inactive' : 'active';
    setStored(STORAGE_KEYS.BANK_ACCOUNTS, accounts);
    this.notifyChange('BANK_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(
        supabase.from('bank_accounts').update({ status: target.status }).eq('id', id)
      );
    }

    await this.logAction(
      actorName,
      'Bank Updated',
      `Changed status of ${target.bank_name} to ${target.status}`,
      actorId
    );
    return target;
  }

  // UPI Accounts
  public getUpiAccounts(): UpiAccount[] {
    const list = getStored<UpiAccount[]>(STORAGE_KEYS.UPI_ACCOUNTS, []);
    return list.sort((a, b) => a.priority - b.priority);
  }

  public getActiveUpiAccounts(): UpiAccount[] {
    return this.getUpiAccounts().filter((a) => a.status === 'active');
  }

  public async saveUpiAccount(
    account: Partial<UpiAccount>,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<UpiAccount> {
    const list = getStored<UpiAccount[]>(STORAGE_KEYS.UPI_ACCOUNTS, []);
    let saved: UpiAccount;

    if (account.id) {
      // Edit
      const index = list.findIndex((a) => a.id === account.id);
      if (index === -1) throw new Error('UPI account not found');
      saved = {
        ...list[index],
        ...account,
      } as UpiAccount;
      list[index] = saved;

      await this.logAction(
        actorName,
        'UPI Updated',
        `Updated UPI ID ${saved.upi_id} (${saved.upi_app})`,
        actorId
      );
    } else {
      // Create
      saved = {
        id: `upi_${Date.now()}`,
        upi_id: (account.upi_id || '').toLowerCase().trim(),
        upi_app: account.upi_app || 'Google Pay',
        qr_url: account.qr_url || '',
        priority: Number(account.priority) || list.length + 1,
        daily_limit: Number(account.daily_limit) || 100000,
        notes: account.notes || '',
        status: account.status || 'active',
        created_at: new Date().toISOString(),
      };
      list.push(saved);

      await this.logAction(
        actorName,
        'UPI Added',
        `Added new UPI ID ${saved.upi_id} (${saved.upi_app})`,
        actorId
      );
    }

    setStored(STORAGE_KEYS.UPI_ACCOUNTS, list);
    this.notifyChange('UPI_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(supabase.from('upi_accounts').upsert(saved));
    }

    return saved;
  }

  public async deleteUpiAccount(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<boolean> {
    const list = getStored<UpiAccount[]>(STORAGE_KEYS.UPI_ACCOUNTS, []);
    const target = list.find((a) => a.id === id);
    if (!target) return false;

    const filtered = list.filter((a) => a.id !== id);
    setStored(STORAGE_KEYS.UPI_ACCOUNTS, filtered);
    this.notifyChange('UPI_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(supabase.from('upi_accounts').delete().eq('id', id));
    }

    await this.logAction(
      actorName,
      'UPI Deleted',
      `Deleted UPI account ${target.upi_id}`,
      actorId
    );
    return true;
  }

  public async toggleUpiAccountStatus(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<UpiAccount | null> {
    const list = getStored<UpiAccount[]>(STORAGE_KEYS.UPI_ACCOUNTS, []);
    const target = list.find((a) => a.id === id);
    if (!target) return null;

    target.status = target.status === 'active' ? 'inactive' : 'active';
    setStored(STORAGE_KEYS.UPI_ACCOUNTS, list);
    this.notifyChange('UPI_ACCOUNTS');

    if (isSupabaseConfigured() && supabase) {
      this.safeSupabaseCall(
        supabase.from('upi_accounts').update({ status: target.status }).eq('id', id)
      );
    }

    await this.logAction(
      actorName,
      'UPI Updated',
      `Changed status of UPI ID ${target.upi_id} to ${target.status}`,
      actorId
    );
    return target;
  }

  // Clients
  public getClients(): Client[] {
    return getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
  }

  public getClientById(id: string): Client | undefined {
    return this.getClients().find((c) => c.id === id);
  }

  public async saveClient(
    clientData: Partial<Client>,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<Client> {
    const clients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    let saved: Client;

    if (clientData.id) {
      const index = clients.findIndex((c) => c.id === clientData.id);
      if (index === -1) throw new Error('Client not found');
      saved = {
        ...clients[index],
        ...clientData,
      } as Client;
      clients[index] = saved;

      await this.logAction(
        actorName,
        'Client Updated',
        `Updated client profile for ${saved.full_name} (${saved.email})`,
        actorId
      );
    } else {
      saved = {
        id: `cli_${Date.now()}`,
        user_id: `usr_client_${Date.now()}`,
        full_name: clientData.full_name || '',
        email: (clientData.email || '').toLowerCase().trim(),
        phone: clientData.phone || '',
        password: clientData.password || 'Client@123',
        status: clientData.status || 'active',
        created_at: new Date().toISOString(),
      };
      clients.unshift(saved);

      await this.logAction(
        actorName,
        'Client Created',
        `Created client account for ${saved.full_name} (${saved.email})`,
        actorId
      );
    }

    setStored(STORAGE_KEYS.CLIENTS, clients);
    return saved;
  }

  public async deleteClient(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<boolean> {
    const clients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    const target = clients.find((c) => c.id === id);
    if (!target) return false;

    const filtered = clients.filter((c) => c.id !== id);
    setStored(STORAGE_KEYS.CLIENTS, filtered);

    await this.logAction(
      actorName,
      'Client Deleted',
      `Deleted client record ${target.full_name} (${target.email})`,
      actorId
    );
    return true;
  }

  public async toggleClientStatus(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<Client | null> {
    const clients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    const target = clients.find((c) => c.id === id);
    if (!target) return null;

    target.status = target.status === 'active' ? 'disabled' : 'active';
    setStored(STORAGE_KEYS.CLIENTS, clients);

    await this.logAction(
      actorName,
      'Client Updated',
      `Updated ${target.full_name}'s status to ${target.status}`,
      actorId
    );
    return target;
  }

  public async resetClientPassword(
    id: string,
    newPass: string = 'Client@123',
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<boolean> {
    const clients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    const target = clients.find((c) => c.id === id);
    if (!target) return false;

    target.password = newPass;
    setStored(STORAGE_KEYS.CLIENTS, clients);

    await this.logAction(
      actorName,
      'Client Updated',
      `Reset password for ${target.full_name} (${target.email})`,
      actorId
    );
    return true;
  }

  // Payment Links
  public getPaymentLinks(): PaymentLink[] {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, INITIAL_PAYMENT_LINKS);
    const clients = this.getClients();

    return links
      .map((link) => {
        const client = clients.find((c) => c.id === link.client_id);
        return {
          ...link,
          client_name: link.client_name || client?.full_name || 'Client',
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getPaymentLinkById(id: string): PaymentLink | null {
    if (!id) return null;
    const cleanId = id.trim().toLowerCase().replace(/\/$/, '');
    const links = this.getPaymentLinks();
    return (
      links.find((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId) ||
      INITIAL_PAYMENT_LINKS.find((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId) ||
      null
    );
  }

  public savePaymentLink(link: PaymentLink): void {
    const links = this.getPaymentLinks();
    const cleanId = link.id.trim().toLowerCase().replace(/\/$/, '');
    const existingIndex = links.findIndex((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId);
    
    if (existingIndex >= 0) {
      links[existingIndex] = { ...links[existingIndex], ...link };
      setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
    } else {
      setStored(STORAGE_KEYS.PAYMENT_LINKS, [link, ...links]);
    }
  }

  public async createPaymentLink(
    clientId: string,
    amount: number,
    remarks?: string,
    actorName: string = 'Admin',
    actorId: string = 'admin',
    redirectUrl?: string,
    upiAccountId?: string
  ): Promise<PaymentLink> {
    const client = this.getClientById(clientId);
    const upiAccounts = this.getActiveUpiAccounts();
    const selectedUpi = upiAccountId
      ? upiAccounts.find((u) => u.id === upiAccountId)
      : upiAccounts[0];

    const upiIdToUse = selectedUpi?.upi_id || (upiAccounts[0]?.upi_id || 'payments@upi');

    const newLink: PaymentLink = {
      id: `pl_${Date.now()}`,
      client_id: clientId,
      client_name: client?.full_name || 'Client',
      amount,
      status: 'Pending',
      remarks: remarks || 'Payment Request',
      upi_account_id: selectedUpi?.id,
      upi_id: upiIdToUse,
      redirect_url: redirectUrl || '',
      created_at: new Date().toISOString(),
    };

    const currentLinks = this.getPaymentLinks();
    setStored(STORAGE_KEYS.PAYMENT_LINKS, [newLink, ...currentLinks]);

    await this.logAction(
      actorName,
      'Payment Link Created',
      `Generated link request for ${client?.full_name || 'Client'} (₹${amount.toLocaleString('en-IN')}) via UPI: ${upiIdToUse}`,
      actorId
    );

    return newLink;
  }

  public async submitPaymentProof(
    linkId: string,
    data: { screenshot_url: string; utr_number?: string }
  ): Promise<PaymentLink | null> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const index = links.findIndex((l) => l.id === linkId);
    if (index === -1) return null;

    links[index] = {
      ...links[index],
      status: 'Pending Confirmation',
      screenshot_url: data.screenshot_url,
      utr_number: data.utr_number || '',
      submitted_at: new Date().toISOString(),
    };

    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);

    await this.logAction(
      links[index].client_name || 'Client',
      'Payment Proof Submitted',
      `Uploaded payment screenshot for ₹${links[index].amount.toLocaleString('en-IN')}${
        data.utr_number ? ` (UTR: ${data.utr_number})` : ''
      }. Awaiting admin confirmation.`,
      links[index].client_id || 'client'
    );

    return links[index];
  }

  public async confirmPaymentLink(
    linkId: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<PaymentLink | null> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const index = links.findIndex((l) => l.id === linkId);
    if (index === -1) return null;

    const link = links[index];
    const updated: PaymentLink = {
      ...link,
      status: 'Paid',
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorName,
    };
    links[index] = updated;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);

    // Automatically record settlement in Transactions
    const transactions = getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
    const newTx: Transaction = {
      id: `tx_${Date.now()}`,
      client_id: link.client_id,
      client_name: link.client_name || 'Client',
      amount: link.amount,
      method: 'UPI',
      destination_name: link.upi_id || 'Authorized UPI Account',
      reference_no: link.utr_number || `UPI-${Date.now().toString().slice(-8)}`,
      status: 'Completed',
      created_at: new Date().toISOString(),
    };
    setStored(STORAGE_KEYS.TRANSACTIONS, [newTx, ...transactions]);

    await this.logAction(
      actorName,
      'Payment Link Confirmed',
      `Confirmed payment of ₹${link.amount.toLocaleString('en-IN')} for ${link.client_name || 'Client'}`,
      actorId
    );

    return updated;
  }

  public async rejectPaymentLink(
    linkId: string,
    reason: string = 'Payment verification could not be validated',
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<PaymentLink | null> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const index = links.findIndex((l) => l.id === linkId);
    if (index === -1) return null;

    const link = links[index];
    const updated: PaymentLink = {
      ...link,
      status: 'Rejected',
      rejection_reason: reason,
    };
    links[index] = updated;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);

    await this.logAction(
      actorName,
      'Payment Link Rejected',
      `Rejected payment proof for ${link.client_name || 'Client'}. Reason: ${reason}`,
      actorId
    );

    return updated;
  }

  // Settings
  public getSettings(): Settings {
    return getStored<Settings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  }

  public async updateSettings(
    newSettings: Partial<Settings>,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<Settings> {
    const current = this.getSettings();
    const updated = {
      ...current,
      ...newSettings,
    };
    setStored(STORAGE_KEYS.SETTINGS, updated);

    await this.logAction(
      actorName,
      'Settings Changed',
      `Updated portal configuration (Company: ${updated.company_name})`,
      actorId
    );
    return updated;
  }

  // Transactions
  public getTransactions(): Transaction[] {
    return getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
  }

  // Dashboard Stats
  public getDashboardStats() {
    const bankAccounts = this.getBankAccounts();
    const upiAccounts = this.getUpiAccounts();
    const clients = this.getClients();
    const paymentLinks = this.getPaymentLinks();
    const activityLogs = this.getActivityLogs();
    const transactions = this.getTransactions();

    const todayStr = new Date().toISOString().split('T')[0];
    const todayLinks = paymentLinks.filter((l) => l.created_at.startsWith(todayStr)).length;

    return {
      totalBankAccounts: bankAccounts.length,
      activeBankAccounts: bankAccounts.filter((b) => b.status === 'active').length,
      inactiveBankAccounts: bankAccounts.filter((b) => b.status === 'inactive').length,

      totalUpiIds: upiAccounts.length,
      activeUpiIds: upiAccounts.filter((u) => u.status === 'active').length,
      inactiveUpiIds: upiAccounts.filter((u) => u.status === 'inactive').length,

      totalClients: clients.length,
      activeClients: clients.filter((c) => c.status === 'active').length,

      todayPaymentLinks: todayLinks,
      pendingConfirmationLinks: paymentLinks.filter((l) => l.status === 'Pending Confirmation').length,
      recentActivity: activityLogs.slice(0, 6),
      recentTransactions: transactions.slice(0, 6),
    };
  }

  // Reset demo data
  public resetToDefaults() {
    setStored(STORAGE_KEYS.PROFILES, [INITIAL_SUPER_ADMIN]);
    setStored(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
    setStored(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS);
    setStored(STORAGE_KEYS.UPI_ACCOUNTS, INITIAL_UPI_ACCOUNTS);
    setStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    setStored(STORAGE_KEYS.PAYMENT_LINKS, INITIAL_PAYMENT_LINKS);
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, INITIAL_ACTIVITY_LOGS);
    setStored(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
  }
}

export const db = new DatabaseService();
