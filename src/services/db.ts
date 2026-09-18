import {
  Profile,
  BankAccount,
  UpiAccount,
  Client,
  PaymentLink,
  PaymentSubmission,
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { firestoreDb, isFirebaseConfigured } from '../lib/firebase';

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

    // Clean fresh start: Clear any previous test payment links, activity logs, and transactions, keeping bank accounts, upi accounts, and clients intact
    const FRESH_VERSION_KEY = 'portal_fresh_state_v3';
    if (!localStorage.getItem(FRESH_VERSION_KEY)) {
      setStored(STORAGE_KEYS.PAYMENT_LINKS, []);
      setStored(STORAGE_KEYS.ACTIVITY_LOGS, []);
      setStored(STORAGE_KEYS.TRANSACTIONS, []);
      try {
        localStorage.setItem(FRESH_VERSION_KEY, 'true');
      } catch {
        // Ignore
      }
      this.purgeAllTransactionalData().catch((e) => console.warn('Purge error:', e));
    }

    this.initialized = true;
    // Trigger background cloud sync
    this.syncAccountsFromCloud().catch(() => {});
    this.syncClientsFromCloud().catch(() => {});
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

  public subscribeToRealtimeUpdates(callback: () => void): () => void {
    if (!isFirebaseConfigured() || !firestoreDb) {
      return () => {};
    }

    try {
      const unsubBanks = onSnapshot(
        collection(firestoreDb, 'bank_accounts'),
        (snapshot) => {
          const remoteBanks: BankAccount[] = [];
          snapshot.forEach((docSnap) => {
            remoteBanks.push(docSnap.data() as BankAccount);
          });
          if (remoteBanks.length > 0) {
            setStored(STORAGE_KEYS.BANK_ACCOUNTS, remoteBanks.sort((a, b) => a.priority - b.priority));
          }
          callback();
        },
        (err) => console.warn('Firestore realtime banks error:', err)
      );

      const unsubUpis = onSnapshot(
        collection(firestoreDb, 'upi_accounts'),
        (snapshot) => {
          const remoteUpis: UpiAccount[] = [];
          snapshot.forEach((docSnap) => {
            remoteUpis.push(docSnap.data() as UpiAccount);
          });
          if (remoteUpis.length > 0) {
            setStored(STORAGE_KEYS.UPI_ACCOUNTS, remoteUpis.sort((a, b) => a.priority - b.priority));
          }
          callback();
        },
        (err) => console.warn('Firestore realtime upis error:', err)
      );

      const unsubClients = onSnapshot(
        collection(firestoreDb, 'clients'),
        (snapshot) => {
          const remoteClients: Client[] = [];
          snapshot.forEach((docSnap) => {
            remoteClients.push(docSnap.data() as Client);
          });
          if (remoteClients.length > 0) {
            setStored(STORAGE_KEYS.CLIENTS, remoteClients);
          }
          callback();
        },
        (err) => console.warn('Firestore realtime clients error:', err)
      );

      const unsubLinks = onSnapshot(
        collection(firestoreDb, 'payment_links'),
        (snapshot) => {
          const remoteLinks: PaymentLink[] = [];
          snapshot.forEach((docSnap) => {
            remoteLinks.push(docSnap.data() as PaymentLink);
          });
          if (remoteLinks.length > 0) {
            const linkMap = new Map<string, PaymentLink>();
            for (const item of remoteLinks) {
              const key = (item.id || '').trim().toLowerCase().replace(/\/$/, '');
              if (!linkMap.has(key)) {
                linkMap.set(key, item);
              } else {
                const existing = linkMap.get(key)!;
                const existingTime = new Date(existing.confirmed_at || existing.submitted_at || existing.created_at).getTime();
                const itemTime = new Date(item.confirmed_at || item.submitted_at || item.created_at).getTime();
                if (itemTime >= existingTime) {
                  linkMap.set(key, item);
                }
              }
            }
            const deduped = Array.from(linkMap.values()).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setStored(STORAGE_KEYS.PAYMENT_LINKS, deduped);
          } else {
            setStored(STORAGE_KEYS.PAYMENT_LINKS, remoteLinks);
          }
          callback();
        },
        (err) => console.warn('Firestore realtime payment links error:', err)
      );

      const unsubTx = onSnapshot(
        collection(firestoreDb, 'transactions'),
        (snapshot) => {
          const remoteTx: Transaction[] = [];
          snapshot.forEach((docSnap) => {
            remoteTx.push(docSnap.data() as Transaction);
          });
          setStored(STORAGE_KEYS.TRANSACTIONS, remoteTx);
          callback();
        },
        (err) => console.warn('Firestore realtime transactions error:', err)
      );

      return () => {
        unsubBanks();
        unsubUpis();
        unsubClients();
        unsubLinks();
        unsubTx();
      };
    } catch (e) {
      console.warn('Failed to attach firestore realtime listener:', e);
      return () => {};
    }
  }

  // Subscribe directly to a single payment link document for instant, zero-latency live updates
  public subscribeToPaymentLink(linkId: string, callback: (link: PaymentLink) => void): () => void {
    if (!linkId) return () => {};
    const cleanExactId = linkId.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();

    if (!isFirebaseConfigured() || !firestoreDb) {
      return () => {};
    }

    let lastKnownHash = '';

    try {
      const unsub = onSnapshot(
        doc(firestoreDb, 'payment_links', cleanExactId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as PaymentLink;
            const currentHash = `${data.amount}_${data.remarks}_${data.status}_${data.is_active}_${data.upi_enabled}_${data.bank_enabled}_${data.upi_id}_${data.upi_account_id}_${JSON.stringify(data.custom_bank_accounts || [])}`;
            if (currentHash === lastKnownHash) {
              return; // Guard: No actual field changes, prevent unnecessary callback
            }
            lastKnownHash = currentHash;

            // Silently update local store without triggering broad event storms
            const links = this.getPaymentLinks();
            const idx = links.findIndex(
              (l) => l.id.trim().toLowerCase() === cleanLowerId || l.id === data.id
            );
            if (idx >= 0) {
              links[idx] = { ...links[idx], ...data };
            } else {
              links.unshift(data);
            }
            setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
            callback(data);
          }
        },
        (err) => console.warn('Firestore live link subscription warning:', err)
      );
      return unsub;
    } catch (e) {
      console.warn('Failed to subscribe to payment link document:', e);
      return () => {};
    }
  }

  public async syncClientsFromCloud(): Promise<Client[]> {
    let localClients = this.getClients();
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'clients'));
        const remoteClients: Client[] = [];
        snap.forEach((docSnap) => {
          remoteClients.push(docSnap.data() as Client);
        });

        const clientsSeeded = localStorage.getItem('firebase_clients_init_seeded');
        if (remoteClients.length > 0) {
          localClients = remoteClients;
          setStored(STORAGE_KEYS.CLIENTS, localClients);
          localStorage.setItem('firebase_clients_init_seeded', 'true');
        } else if (!clientsSeeded && localClients.length > 0) {
          for (const c of localClients) {
            await setDoc(doc(firestoreDb, 'clients', c.id), c);
          }
          localStorage.setItem('firebase_clients_init_seeded', 'true');
        } else if (clientsSeeded && remoteClients.length === 0) {
          localClients = [];
          setStored(STORAGE_KEYS.CLIENTS, localClients);
        }
      } catch (err) {
        console.warn('Firebase Firestore clients sync failed:', err);
      }
    }
    return localClients;
  }

  public async syncPaymentLinksFromCloud(): Promise<PaymentLink[]> {
    let localLinks = this.getPaymentLinks();
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'payment_links'));
        const remoteLinks: PaymentLink[] = [];
        snap.forEach((docSnap) => {
          remoteLinks.push(docSnap.data() as PaymentLink);
        });

        if (remoteLinks.length > 0) {
          const linkMap = new Map<string, PaymentLink>();
          for (const item of remoteLinks) {
            const key = (item.id || '').trim().toLowerCase().replace(/\/$/, '');
            if (!linkMap.has(key)) {
              linkMap.set(key, item);
            } else {
              const existing = linkMap.get(key)!;
              const existingTime = new Date(existing.confirmed_at || existing.submitted_at || existing.created_at).getTime();
              const itemTime = new Date(item.confirmed_at || item.submitted_at || item.created_at).getTime();
              if (itemTime >= existingTime) {
                linkMap.set(key, item);
              }
            }
          }
          // Also merge any local-only links that haven't been pushed
          for (const l of localLinks) {
            const key = (l.id || '').trim().toLowerCase().replace(/\/$/, '');
            if (!linkMap.has(key)) {
              linkMap.set(key, l);
            }
          }
          localLinks = Array.from(linkMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setStored(STORAGE_KEYS.PAYMENT_LINKS, localLinks);
        }
      } catch (err) {
        console.warn('Firebase Firestore payment links sync failed:', err);
      }
    }
    return localLinks;
  }

  public async syncAccountsFromCloud(): Promise<{ banks: BankAccount[]; upis: UpiAccount[] }> {
    let localBanks = this.getBankAccounts();
    let localUpis = this.getUpiAccounts();

    // 1. Firebase Firestore sync (Primary)
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const [banksSnap, upisSnap] = await Promise.all([
          getDocs(collection(firestoreDb, 'bank_accounts')),
          getDocs(collection(firestoreDb, 'upi_accounts')),
        ]);

        const remoteBanks: BankAccount[] = [];
        banksSnap.forEach((docSnap) => {
          remoteBanks.push(docSnap.data() as BankAccount);
        });

        const remoteUpis: UpiAccount[] = [];
        upisSnap.forEach((docSnap) => {
          remoteUpis.push(docSnap.data() as UpiAccount);
        });

        const banksSeeded = localStorage.getItem('firebase_banks_init_seeded');
        if (remoteBanks.length > 0) {
          localBanks = remoteBanks.sort((a, b) => a.priority - b.priority);
          setStored(STORAGE_KEYS.BANK_ACCOUNTS, localBanks);
          localStorage.setItem('firebase_banks_init_seeded', 'true');
        } else if (!banksSeeded && localBanks.length > 0) {
          for (const b of localBanks) {
            await setDoc(doc(firestoreDb, 'bank_accounts', b.id), b);
          }
          localStorage.setItem('firebase_banks_init_seeded', 'true');
        } else if (banksSeeded && remoteBanks.length === 0) {
          localBanks = [];
          setStored(STORAGE_KEYS.BANK_ACCOUNTS, localBanks);
        }

        const upisSeeded = localStorage.getItem('firebase_upis_init_seeded');
        if (remoteUpis.length > 0) {
          localUpis = remoteUpis.sort((a, b) => a.priority - b.priority);
          setStored(STORAGE_KEYS.UPI_ACCOUNTS, localUpis);
          localStorage.setItem('firebase_upis_init_seeded', 'true');
        } else if (!upisSeeded && localUpis.length > 0) {
          for (const u of localUpis) {
            await setDoc(doc(firestoreDb, 'upi_accounts', u.id), u);
          }
          localStorage.setItem('firebase_upis_init_seeded', 'true');
        } else if (upisSeeded && remoteUpis.length === 0) {
          localUpis = [];
          setStored(STORAGE_KEYS.UPI_ACCOUNTS, localUpis);
        }

        return { banks: localBanks, upis: localUpis };
      } catch (err) {
        console.warn('Firebase Firestore sync failed:', err);
      }
    }

    // 2. Supabase fallback (Secondary if configured)
    if (isSupabaseConfigured() && supabase) {
      try {
        const [banksRes, upisRes] = await Promise.all([
          supabase.from('bank_accounts').select('*').order('priority', { ascending: true }),
          supabase.from('upi_accounts').select('*').order('priority', { ascending: true }),
        ]);

        const banksSeeded = localStorage.getItem('supabase_banks_init_seeded');
        if (!banksRes.error && Array.isArray(banksRes.data)) {
          if (banksRes.data.length > 0) {
            localBanks = banksRes.data as BankAccount[];
            setStored(STORAGE_KEYS.BANK_ACCOUNTS, localBanks);
            localStorage.setItem('supabase_banks_init_seeded', 'true');
          } else if (!banksSeeded && localBanks.length > 0) {
            for (const b of localBanks) {
              await this.safeSupabaseCall(supabase.from('bank_accounts').upsert(b));
            }
            localStorage.setItem('supabase_banks_init_seeded', 'true');
          } else if (banksSeeded && banksRes.data.length === 0) {
            localBanks = [];
            setStored(STORAGE_KEYS.BANK_ACCOUNTS, localBanks);
          }
        }

        const upisSeeded = localStorage.getItem('supabase_upis_init_seeded');
        if (!upisRes.error && Array.isArray(upisRes.data)) {
          if (upisRes.data.length > 0) {
            localUpis = upisRes.data as UpiAccount[];
            setStored(STORAGE_KEYS.UPI_ACCOUNTS, localUpis);
            localStorage.setItem('supabase_upis_init_seeded', 'true');
          } else if (!upisSeeded && localUpis.length > 0) {
            for (const u of localUpis) {
              await this.safeSupabaseCall(supabase.from('upi_accounts').upsert(u));
            }
            localStorage.setItem('supabase_upis_init_seeded', 'true');
          } else if (upisSeeded && upisRes.data.length === 0) {
            localUpis = [];
            setStored(STORAGE_KEYS.UPI_ACCOUNTS, localUpis);
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
    userRole: string = 'admin',
    ipAddress?: string
  ): Promise<ActivityLog> {
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action,
      details,
      ip_address: ipAddress || '',
      created_at: new Date().toISOString(),
    };

    const logs = getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
    const updated = [newLog, ...logs];
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, updated);
    this.notifyChange('ACTIVITY_LOGS');

    if (isFirebaseConfigured() && firestoreDb) {
      setDoc(doc(firestoreDb, 'activity_logs', newLog.id), newLog).catch((err) =>
        console.warn('Firebase log insert warning:', err)
      );
    }

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

  public async deleteActivityLog(id: string): Promise<boolean> {
    const logs = getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
    const filtered = logs.filter((l) => l.id !== id);
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, filtered);
    this.notifyChange('ACTIVITY_LOGS');

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'activity_logs', id)).catch((err) =>
        console.warn('Firebase log delete warning:', err)
      );
    }
    return true;
  }

  public async clearActivityLogs(): Promise<boolean> {
    const logs = getStored<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, []);
    this.notifyChange('ACTIVITY_LOGS');

    if (isFirebaseConfigured() && firestoreDb) {
      for (const log of logs) {
        deleteDoc(doc(firestoreDb, 'activity_logs', log.id)).catch(() => {});
      }
    }
    return true;
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

    if (isFirebaseConfigured() && firestoreDb) {
      setDoc(doc(firestoreDb, 'bank_accounts', saved.id), saved).catch((e) =>
        console.warn('Firebase bank save error:', e)
      );
    }

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

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'bank_accounts', id)).catch((e) =>
        console.warn('Firebase bank delete error:', e)
      );
    }

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

    if (isFirebaseConfigured() && firestoreDb) {
      updateDoc(doc(firestoreDb, 'bank_accounts', id), { status: target.status }).catch((e) =>
        console.warn('Firebase bank status update error:', e)
      );
    }

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

    if (isFirebaseConfigured() && firestoreDb) {
      setDoc(doc(firestoreDb, 'upi_accounts', saved.id), saved).catch((e) =>
        console.warn('Firebase upi save error:', e)
      );
    }

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

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'upi_accounts', id)).catch((e) =>
        console.warn('Firebase upi delete error:', e)
      );
    }

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

    if (isFirebaseConfigured() && firestoreDb) {
      updateDoc(doc(firestoreDb, 'upi_accounts', id), { status: target.status }).catch((e) =>
        console.warn('Firebase upi status update error:', e)
      );
    }

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
    this.notifyChange('CLIENTS');

    if (isFirebaseConfigured() && firestoreDb) {
      setDoc(doc(firestoreDb, 'clients', saved.id), saved).catch((e) =>
        console.warn('Firebase client save error:', e)
      );
    }

    return saved;
  }

  public async recordClientLogin(clientId: string, ipAddress: string): Promise<void> {
    const clients = getStored<Client[]>(STORAGE_KEYS.CLIENTS, []);
    const idx = clients.findIndex((c) => c.id === clientId || c.user_id === clientId);
    if (idx !== -1) {
      clients[idx] = {
        ...clients[idx],
        last_login_ip: ipAddress,
        last_login_at: new Date().toISOString(),
      };
      setStored(STORAGE_KEYS.CLIENTS, clients);
      this.notifyChange('CLIENTS');

      if (isFirebaseConfigured() && firestoreDb) {
        setDoc(doc(firestoreDb, 'clients', clients[idx].id), clients[idx], { merge: true }).catch((e) =>
          console.warn('Firebase client login update error:', e)
        );
      }
    }
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
    this.notifyChange('CLIENTS');

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'clients', id)).catch((e) =>
        console.warn('Firebase client delete error:', e)
      );
    }

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
    this.notifyChange('CLIENTS');

    if (isFirebaseConfigured() && firestoreDb) {
      updateDoc(doc(firestoreDb, 'clients', id), { status: target.status }).catch((e) =>
        console.warn('Firebase client status update error:', e)
      );
    }

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
    this.notifyChange('CLIENTS');

    if (isFirebaseConfigured() && firestoreDb) {
      updateDoc(doc(firestoreDb, 'clients', id), { password: newPass }).catch((e) =>
        console.warn('Firebase client password update error:', e)
      );
    }

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

  public async fetchPaymentLinkById(id: string): Promise<PaymentLink | null> {
    if (!id) return null;
    const cleanExactId = id.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();

    // 1. Check Firebase Firestore FIRST for live cloud-synchronized data
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        let docSnap = await getDoc(doc(firestoreDb, 'payment_links', cleanExactId));
        if (!docSnap.exists() && cleanExactId !== cleanLowerId) {
          docSnap = await getDoc(doc(firestoreDb, 'payment_links', cleanLowerId));
        }
        if (docSnap.exists()) {
          const remoteLink = docSnap.data() as PaymentLink;
          // Silently cache in local memory without firing notifications or writing back to Firestore
          const links = this.getPaymentLinks();
          const cleanId = remoteLink.id.trim().toLowerCase().replace(/\/$/, '');
          const existingIndex = links.findIndex(
            (l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId
          );
          if (existingIndex >= 0) {
            links[existingIndex] = { ...links[existingIndex], ...remoteLink };
          } else {
            links.unshift(remoteLink);
          }
          setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
          return remoteLink;
        }
      } catch (err) {
        console.warn('Firebase fetchPaymentLinkById error:', err);
      }
    }

    // 2. Fall back to local storage cache
    const local = this.getPaymentLinkById(id);
    if (local) return local;

    return null;
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
    this.notifyChange('PAYMENT_LINKS');

    if (isFirebaseConfigured() && firestoreDb) {
      setDoc(doc(firestoreDb, 'payment_links', link.id), link, { merge: true }).catch((e) =>
        console.warn('Firebase savePaymentLink error:', e)
      );
    }
  }

  public savePaymentLinkSilently(link: PaymentLink): void {
    const links = this.getPaymentLinks();
    const cleanId = link.id.trim().toLowerCase().replace(/\/$/, '');
    const existingIndex = links.findIndex((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId);
    if (existingIndex >= 0) {
      links[existingIndex] = { ...links[existingIndex], ...link };
    } else {
      links.unshift(link);
    }
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
  }

  public async deletePaymentLink(
    id: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<boolean> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const cleanId = id.trim().toLowerCase().replace(/\/$/, '');
    const target = links.find((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId);
    const filtered = links.filter((l) => l.id.trim().toLowerCase().replace(/\/$/, '') !== cleanId);
    setStored(STORAGE_KEYS.PAYMENT_LINKS, filtered);
    this.notifyChange('PAYMENT_LINKS');

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'payment_links', id)).catch((err) =>
        console.warn('Firebase link delete error:', err)
      );
    }

    await this.logAction(
      actorName,
      'Payment Link Deleted',
      `Deleted payment link ${id} for ${target?.client_name || 'Client'} (₹${target?.amount || 0})`,
      actorId
    );

    return true;
  }

  public async createPaymentLink(
    clientId: string,
    amount: number,
    remarks?: string,
    actorName: string = 'Admin',
    actorId: string = 'admin',
    redirectUrl?: string,
    upiAccountId?: string,
    linkType: 'one_time' | 'live' = 'one_time',
    options?: {
      upi_enabled?: boolean;
      bank_enabled?: boolean;
      custom_upi_id?: string;
      custom_bank_accounts?: BankAccount[];
    }
  ): Promise<PaymentLink> {
    const client = this.getClientById(clientId);
    const upiAccounts = this.getActiveUpiAccounts();
    const selectedUpi = upiAccountId
      ? upiAccounts.find((u) => u.id === upiAccountId)
      : upiAccounts[0];

    const upiIdToUse = options?.custom_upi_id || selectedUpi?.upi_id || (upiAccounts[0]?.upi_id || 'payments@upi');

    // Generate ultra short, unique and clean link ID (e.g. 'p7x2k9', 'k8m3w4')
    const shortRandom = Math.random().toString(36).substring(2, 8);
    const shortId = `p${shortRandom}`;

    const newLink: PaymentLink = {
      id: shortId,
      client_id: clientId,
      client_name: client?.full_name || 'Client',
      amount,
      status: 'Pending',
      remarks: remarks || 'Payment Request',
      link_type: linkType,
      is_active: true,
      upi_enabled: options?.upi_enabled !== undefined ? options.upi_enabled : true,
      bank_enabled: options?.bank_enabled !== undefined ? options.bank_enabled : true,
      custom_upi_id: options?.custom_upi_id || '',
      custom_bank_accounts: options?.custom_bank_accounts || [],
      upi_account_id: selectedUpi?.id || '',
      upi_id: upiIdToUse,
      redirect_url: redirectUrl || '',
      created_at: new Date().toISOString(),
    };

    const currentLinks = this.getPaymentLinks();
    setStored(STORAGE_KEYS.PAYMENT_LINKS, [newLink, ...currentLinks]);
    this.notifyChange('PAYMENT_LINKS');

    if (isFirebaseConfigured() && firestoreDb) {
      // Clean undefined fields to prevent Firestore serialization errors
      const firestoreData = Object.fromEntries(
        Object.entries(newLink).filter(([_, v]) => v !== undefined)
      );
      setDoc(doc(firestoreDb, 'payment_links', newLink.id), firestoreData).catch((e) =>
        console.warn('Firebase payment link save error:', e)
      );
    }

    try {
      await this.logAction(
        actorName,
        'Payment Link Created',
        `Generated link for ${client?.full_name || 'Client'} (₹${amount.toLocaleString('en-IN')})`,
        actorId
      );
    } catch (logErr) {
      console.warn('Action log warning:', logErr);
    }

    return newLink;
  }

  public async togglePaymentLinkActive(
    id: string,
    actorName: string = 'User',
    actorId: string = 'user'
  ): Promise<PaymentLink | null> {
    const links = this.getPaymentLinks();
    const cleanId = id.trim().toLowerCase().replace(/\/$/, '');
    const index = links.findIndex((l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanId);
    if (index === -1) return null;

    const currentActive = links[index].is_active !== false;
    links[index].is_active = !currentActive;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
    this.notifyChange('PAYMENT_LINKS');

    if (isFirebaseConfigured() && firestoreDb) {
      updateDoc(doc(firestoreDb, 'payment_links', links[index].id), {
        is_active: links[index].is_active,
      }).catch((e) => console.warn('Firebase link toggle error:', e));
    }

    await this.logAction(
      actorName,
      'Link Status Changed',
      `${links[index].is_active ? 'Activated' : 'Shutdown (Deactivated)'} link ${links[index].id}`,
      actorId
    );

    return links[index];
  }

  public async updateLivePaymentLink(
    id: string,
    updates: Partial<PaymentLink>,
    actorName: string = 'Client',
    actorId: string = 'client'
  ): Promise<PaymentLink | null> {
    const links = this.getPaymentLinks();
    const cleanExactId = id.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();
    let index = links.findIndex(
      (l) => l.id.trim().toLowerCase() === cleanLowerId || l.id === cleanExactId
    );

    // If not found in memory, attempt fetching from cloud
    if (index === -1 && isFirebaseConfigured() && firestoreDb) {
      try {
        let snap = await getDoc(doc(firestoreDb, 'payment_links', cleanExactId));
        if (!snap.exists() && cleanExactId !== cleanLowerId) {
          snap = await getDoc(doc(firestoreDb, 'payment_links', cleanLowerId));
        }
        if (snap.exists()) {
          const fetchedLink = snap.data() as PaymentLink;
          links.unshift(fetchedLink);
          index = 0;
        }
      } catch (e) {
        console.warn('Cloud fetch before update error:', e);
      }
    }

    if (index === -1) {
      throw new Error(`Payment link ${id} not found.`);
    }

    const currentLink = links[index];
    const updatedLink: PaymentLink = {
      ...currentLink,
      ...updates,
      id: currentLink.id, // protect original ID
      created_at: currentLink.created_at, // protect creation date
    };

    links[index] = updatedLink;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
    this.notifyChange('PAYMENT_LINKS');

    // Dispatch targeted event specifically for saved link edits
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('payment_link_edited_saved', {
          detail: { linkId: updatedLink.id, updatedLink },
        })
      );
    }

    // Broadcast across windows / tabs
    try {
      const channel = new BroadcastChannel('payment_portal_channel');
      channel.postMessage({
        type: 'PAYMENT_LINK_EDIT_SAVED',
        linkId: updatedLink.id,
        updatedLink,
        time: Date.now(),
      });
      channel.close();
    } catch {
      // Ignore broadcast channel errors in restricted environments
    }

    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const cleanPayload = Object.fromEntries(
          Object.entries(updatedLink).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(firestoreDb, 'payment_links', updatedLink.id), cleanPayload, { merge: true });
        if (updatedLink.id.toLowerCase() !== updatedLink.id) {
          // Also sync lowercase document ID if applicable
          await setDoc(doc(firestoreDb, 'payment_links', updatedLink.id.toLowerCase()), cleanPayload, { merge: true }).catch(() => {});
        }
      } catch (e) {
        console.warn('Firebase live link update error:', e);
      }
    }

    await this.logAction(
      actorName,
      'Live Link Updated',
      `Updated link ${updatedLink.id} (₹${updatedLink.amount || 0})`,
      actorId
    );

    return updatedLink;
  }

  // Alias for generic payment link update
  public async updatePaymentLink(
    id: string,
    updates: Partial<PaymentLink>,
    actorName: string = 'User',
    actorId: string = 'user'
  ): Promise<PaymentLink | null> {
    return this.updateLivePaymentLink(id, updates, actorName, actorId);
  }

  public async submitPaymentProof(
    linkId: string,
    data: { screenshot_url?: string; utr_number?: string; amount?: number; method?: string }
  ): Promise<PaymentLink | null> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const cleanExactId = linkId.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();
    let index = links.findIndex(
      (l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanLowerId || l.id === cleanExactId
    );

    if (index === -1 && isFirebaseConfigured() && firestoreDb) {
      try {
        let snap = await getDoc(doc(firestoreDb, 'payment_links', cleanExactId));
        if (!snap.exists() && cleanExactId !== cleanLowerId) {
          snap = await getDoc(doc(firestoreDb, 'payment_links', cleanLowerId));
        }
        if (snap.exists()) {
          const remoteLink = snap.data() as PaymentLink;
          links.unshift(remoteLink);
          index = 0;
        }
      } catch (err) {
        console.warn('Firebase fetch before proof submit error:', err);
      }
    }

    if (index === -1) {
      const fallbackLink: PaymentLink = {
        id: cleanExactId,
        client_id: 'client',
        client_name: 'Client',
        amount: data.amount || 0,
        status: 'Pending Confirmation',
        remarks: 'Payment Request',
        is_active: true,
        created_at: new Date().toISOString(),
      };
      links.unshift(fallbackLink);
      index = 0;
    }

    const currentLink = links[index];
    const nowIso = new Date().toISOString();

    const newSubmission: PaymentSubmission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: data.amount || currentLink.amount,
      utr_number: data.utr_number || '',
      screenshot_url: data.screenshot_url || '',
      submitted_at: nowIso,
      status: 'Pending Confirmation',
      method: data.method || 'UPI',
    };

    let existingSubmissions = Array.isArray(currentLink.submissions) ? [...currentLink.submissions] : [];
    // If submissions array was empty but link already had an existing submission/confirmation, preserve it:
    if (existingSubmissions.length === 0 && (currentLink.utr_number || currentLink.screenshot_url)) {
      existingSubmissions.push({
        id: `sub_prev_${currentLink.id}`,
        amount: currentLink.last_paid_amount || currentLink.amount,
        utr_number: currentLink.utr_number || '',
        screenshot_url: currentLink.screenshot_url || '',
        submitted_at: currentLink.submitted_at || currentLink.created_at,
        status: currentLink.status || 'Pending Confirmation',
        confirmed_at: currentLink.confirmed_at,
        confirmed_by: currentLink.confirmed_by,
        rejection_reason: currentLink.rejection_reason,
        method: 'UPI',
      });
    }

    const updatedSubmissions = [newSubmission, ...existingSubmissions];

    const updated: PaymentLink = {
      ...currentLink,
      status: 'Pending Confirmation',
      screenshot_url: data.screenshot_url || currentLink.screenshot_url || '',
      utr_number: data.utr_number || currentLink.utr_number || '',
      submitted_at: nowIso,
      submissions: updatedSubmissions,
      last_paid_amount: data.amount || currentLink.amount,
      is_active: true, // ALWAYS KEEP ACTIVE
    };

    links[index] = updated;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);
    this.notifyChange('PAYMENT_LINKS');

    try {
      const channel = new BroadcastChannel('payment_portal_channel');
      channel.postMessage({
        type: 'PAYMENT_LINK_EDIT_SAVED',
        linkId: updated.id,
        updatedLink: updated,
      });
      channel.close();
    } catch {
      // Ignore
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('payment_link_edited_saved', {
          detail: { linkId: updated.id, updatedLink: updated },
        })
      );
    }

    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const cleanPayload = Object.fromEntries(
          Object.entries(updated).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(firestoreDb, 'payment_links', updated.id), cleanPayload, { merge: true });
        if (updated.id.toLowerCase() !== updated.id) {
          await setDoc(doc(firestoreDb, 'payment_links', updated.id.toLowerCase()), cleanPayload, { merge: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('Firebase link update error:', err);
      }
    }

    await this.logAction(
      updated.client_name || 'Client',
      'Payment Submitted',
      `Client submitted payment proof for ₹${(data.amount || updated.amount).toLocaleString('en-IN')}${
        data.utr_number ? ` (Ref/UTR: ${data.utr_number})` : ''
      }. Awaiting admin review.`,
      updated.client_id || 'client'
    );

    return updated;
  }

  public async confirmPaymentLink(
    linkId: string,
    actorName: string = 'Admin',
    actorId: string = 'admin'
  ): Promise<PaymentLink | null> {
    const links = getStored<PaymentLink[]>(STORAGE_KEYS.PAYMENT_LINKS, []);
    const cleanExactId = linkId.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();
    let index = links.findIndex(
      (l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanLowerId || l.id === cleanExactId
    );

    if (index === -1 && isFirebaseConfigured() && firestoreDb) {
      try {
        let snap = await getDoc(doc(firestoreDb, 'payment_links', cleanExactId));
        if (!snap.exists() && cleanExactId !== cleanLowerId) {
          snap = await getDoc(doc(firestoreDb, 'payment_links', cleanLowerId));
        }
        if (snap.exists()) {
          const remoteLink = snap.data() as PaymentLink;
          links.unshift(remoteLink);
          index = 0;
        }
      } catch (err) {
        console.warn('Firebase confirm find link error:', err);
      }
    }

    if (index === -1) return null;

    const link = links[index];
    const nowIso = new Date().toISOString();

    const updatedSubmissions = (link.submissions || []).map((sub, i) => {
      if (i === 0 || sub.status === 'Pending Confirmation') {
        return {
          ...sub,
          status: 'Paid' as const,
          confirmed_at: nowIso,
          confirmed_by: actorName,
        };
      }
      return sub;
    });

    const settledAmount = link.last_paid_amount || link.amount;

    const updated: PaymentLink = {
      ...link,
      status: 'Paid',
      confirmed_at: nowIso,
      confirmed_by: actorName,
      submissions: updatedSubmissions,
      is_active: true, // Link stays continuously active
    };
    links[index] = updated;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);

    // Automatically record settlement in Transactions
    const transactions = getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
    const newTx: Transaction = {
      id: `tx_${Date.now()}`,
      client_id: link.client_id,
      client_name: link.client_name || 'Client',
      amount: settledAmount,
      method: 'UPI',
      destination_name: link.upi_id || 'Authorized UPI Account',
      reference_no: link.utr_number || `UPI-${Date.now().toString().slice(-8)}`,
      status: 'Completed',
      created_at: nowIso,
    };
    setStored(STORAGE_KEYS.TRANSACTIONS, [newTx, ...transactions]);

    // CRITICAL: Notify UI & Broadcast across all tabs
    this.notifyChange('PAYMENT_LINKS');
    this.notifyChange('TRANSACTIONS');

    try {
      const channel = new BroadcastChannel('payment_portal_channel');
      channel.postMessage({
        type: 'PAYMENT_LINK_EDIT_SAVED',
        linkId: link.id,
        updatedLink: updated,
      });
      channel.close();
    } catch {
      // Ignore
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('payment_link_edited_saved', {
          detail: { linkId: link.id, updatedLink: updated },
        })
      );
    }

    // CRITICAL: Write to Firestore so real-time listeners and checkouts get the update
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const cleanPayload = Object.fromEntries(
          Object.entries(updated).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(firestoreDb, 'payment_links', link.id), cleanPayload, { merge: true });
        if (link.id.toLowerCase() !== link.id) {
          await setDoc(doc(firestoreDb, 'payment_links', link.id.toLowerCase()), cleanPayload, { merge: true }).catch(() => {});
        }
        await setDoc(doc(firestoreDb, 'transactions', newTx.id), newTx).catch(() => {});
      } catch (e) {
        console.warn('Firebase confirmPaymentLink error:', e);
      }
    }

    await this.logAction(
      actorName,
      'Payment Link Confirmed',
      `Confirmed payment of ₹${settledAmount.toLocaleString('en-IN')} for ${link.client_name || 'Client'} (UTR: ${link.utr_number || 'N/A'})`,
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
    const cleanExactId = linkId.trim().replace(/\/$/, '');
    const cleanLowerId = cleanExactId.toLowerCase();
    let index = links.findIndex(
      (l) => l.id.trim().toLowerCase().replace(/\/$/, '') === cleanLowerId || l.id === cleanExactId
    );

    if (index === -1 && isFirebaseConfigured() && firestoreDb) {
      try {
        let snap = await getDoc(doc(firestoreDb, 'payment_links', cleanExactId));
        if (!snap.exists() && cleanExactId !== cleanLowerId) {
          snap = await getDoc(doc(firestoreDb, 'payment_links', cleanLowerId));
        }
        if (snap.exists()) {
          const remoteLink = snap.data() as PaymentLink;
          links.unshift(remoteLink);
          index = 0;
        }
      } catch (err) {
        console.warn('Firebase reject find link error:', err);
      }
    }

    if (index === -1) return null;

    const link = links[index];
    const nowIso = new Date().toISOString();

    const updatedSubmissions = (link.submissions || []).map((sub, i) => {
      if (i === 0 || sub.status === 'Pending Confirmation') {
        return {
          ...sub,
          status: 'Rejected' as const,
          rejection_reason: reason,
        };
      }
      return sub;
    });

    const updated: PaymentLink = {
      ...link,
      status: 'Rejected',
      rejection_reason: reason,
      submissions: updatedSubmissions,
      is_active: true, // Link stays continuously active
    };
    links[index] = updated;
    setStored(STORAGE_KEYS.PAYMENT_LINKS, links);

    this.notifyChange('PAYMENT_LINKS');

    try {
      const channel = new BroadcastChannel('payment_portal_channel');
      channel.postMessage({
        type: 'PAYMENT_LINK_EDIT_SAVED',
        linkId: link.id,
        updatedLink: updated,
      });
      channel.close();
    } catch {
      // Ignore
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('payment_link_edited_saved', {
          detail: { linkId: link.id, updatedLink: updated },
        })
      );
    }

    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const cleanPayload = Object.fromEntries(
          Object.entries(updated).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(firestoreDb, 'payment_links', link.id), cleanPayload, { merge: true });
        if (link.id.toLowerCase() !== link.id) {
          await setDoc(doc(firestoreDb, 'payment_links', link.id.toLowerCase()), cleanPayload, { merge: true }).catch(() => {});
        }
      } catch (e) {
        console.warn('Firebase rejectPaymentLink error:', e);
      }
    }

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

  public async deleteTransaction(id: string): Promise<boolean> {
    const txs = getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
    const filtered = txs.filter((t) => t.id !== id);
    setStored(STORAGE_KEYS.TRANSACTIONS, filtered);
    this.notifyChange('TRANSACTIONS');

    if (isFirebaseConfigured() && firestoreDb) {
      deleteDoc(doc(firestoreDb, 'transactions', id)).catch((err) =>
        console.warn('Firebase transaction delete warning:', err)
      );
    }
    return true;
  }

  public async clearTransactions(): Promise<boolean> {
    const txs = getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
    setStored(STORAGE_KEYS.TRANSACTIONS, []);
    this.notifyChange('TRANSACTIONS');

    if (isFirebaseConfigured() && firestoreDb) {
      for (const tx of txs) {
        deleteDoc(doc(firestoreDb, 'transactions', tx.id)).catch(() => {});
      }
    }
    return true;
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

  // Purge all transient data (links, transactions, activity logs) while preserving bank accounts, UPI IDs, and clients
  public async purgeAllTransactionalData(): Promise<void> {
    setStored(STORAGE_KEYS.PAYMENT_LINKS, []);
    setStored(STORAGE_KEYS.TRANSACTIONS, []);
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, []);

    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const linksSnap = await getDocs(collection(firestoreDb, 'payment_links'));
        for (const d of linksSnap.docs) {
          deleteDoc(doc(firestoreDb, 'payment_links', d.id)).catch(() => {});
        }
      } catch (err) {
        console.warn('Error clearing payment_links in firestore:', err);
      }

      try {
        const txSnap = await getDocs(collection(firestoreDb, 'transactions'));
        for (const d of txSnap.docs) {
          deleteDoc(doc(firestoreDb, 'transactions', d.id)).catch(() => {});
        }
      } catch (err) {
        console.warn('Error clearing transactions in firestore:', err);
      }

      try {
        const logsSnap = await getDocs(collection(firestoreDb, 'activity_logs'));
        for (const d of logsSnap.docs) {
          deleteDoc(doc(firestoreDb, 'activity_logs', d.id)).catch(() => {});
        }
      } catch (err) {
        console.warn('Error clearing activity_logs in firestore:', err);
      }
    }

    this.notifyChange('PAYMENT_LINKS');
    this.notifyChange('TRANSACTIONS');
    this.notifyChange('ACTIVITY_LOGS');
  }

  // Reset demo data
  public resetToDefaults() {
    setStored(STORAGE_KEYS.PROFILES, [INITIAL_SUPER_ADMIN]);
    setStored(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
    setStored(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS);
    setStored(STORAGE_KEYS.UPI_ACCOUNTS, INITIAL_UPI_ACCOUNTS);
    setStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    setStored(STORAGE_KEYS.PAYMENT_LINKS, []);
    setStored(STORAGE_KEYS.ACTIVITY_LOGS, []);
    setStored(STORAGE_KEYS.TRANSACTIONS, []);
    this.purgeAllTransactionalData().catch(() => {});
  }
}

export const db = new DatabaseService();
