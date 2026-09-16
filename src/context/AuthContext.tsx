import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, Client, UserRole } from '../types';
import { db } from '../services/db';
import { INITIAL_SUPER_ADMIN } from '../services/seedData';

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone?: string;
  clientId?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  impersonateClient: (client: Client) => void;
  stopImpersonation: () => void;
  isImpersonating: boolean;
  originalAdminUser: AuthUser | null;
}

const AUTH_STORAGE_KEY = 'payment_portal_auth_session';
const IMPERSONATE_STORAGE_KEY = 'payment_portal_impersonate_admin';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [originalAdminUser, setOriginalAdminUser] = useState<AuthUser | null>(null);

  // Load session from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      const storedOriginal = localStorage.getItem(IMPERSONATE_STORAGE_KEY);

      if (stored) {
        setUser(JSON.parse(stored));
      }
      if (storedOriginal) {
        setOriginalAdminUser(JSON.parse(storedOriginal));
      }
    } catch (e) {
      console.error('Failed to parse auth session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Check Super Admin & Admin profiles
    const profiles = JSON.parse(localStorage.getItem('payment_portal_profiles') || '[]') as Profile[];
    let matchedProfile = profiles.find(
      (p) => p.email.toLowerCase() === cleanEmail
    );

    // If super admin not found in profiles, check initial default
    if (!matchedProfile && cleanEmail === INITIAL_SUPER_ADMIN.email.toLowerCase()) {
      matchedProfile = INITIAL_SUPER_ADMIN;
    }

    if (matchedProfile) {
      if (matchedProfile.status === 'disabled') {
        return { success: false, error: 'Your account has been deactivated. Please contact support.' };
      }
      if (matchedProfile.password !== pass) {
        return { success: false, error: 'Invalid email or password.' };
      }

      const authUser: AuthUser = {
        id: matchedProfile.id,
        full_name: matchedProfile.full_name,
        email: matchedProfile.email,
        role: matchedProfile.role,
        phone: matchedProfile.phone,
      };

      setUser(authUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));

      await db.logAction(
        authUser.full_name,
        'Admin Login',
        `User logged into administrative dashboard (${authUser.email})`,
        authUser.id,
        authUser.role
      );

      return { success: true };
    }

    // 2. Check Clients
    let clients = db.getClients();
    let matchedClient = clients.find((c) => c.email.toLowerCase() === cleanEmail);

    if (!matchedClient) {
      // Sync from cloud database in case client was added from another device/browser
      try {
        clients = await db.syncClientsFromCloud();
        matchedClient = clients.find((c) => c.email.toLowerCase() === cleanEmail);
      } catch (err) {
        console.warn('Cloud client lookup failed during login:', err);
      }
    }

    if (matchedClient) {
      if (matchedClient.status === 'disabled') {
        return { success: false, error: 'Client portal access is currently disabled for this account.' };
      }

      const clientPass = matchedClient.password || 'Client@123';
      if (clientPass !== pass) {
        return { success: false, error: 'Invalid email or password.' };
      }

      const authUser: AuthUser = {
        id: matchedClient.user_id || matchedClient.id,
        clientId: matchedClient.id,
        full_name: matchedClient.full_name,
        email: matchedClient.email,
        role: 'client',
        phone: matchedClient.phone,
      };

      setUser(authUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));

      await db.logAction(
        authUser.full_name,
        'Client Login',
        `Client logged into payment information portal (${authUser.email})`,
        authUser.id,
        'client'
      );

      return { success: true };
    }

    return { success: false, error: 'No account registered with this email address.' };
  };

  const logout = () => {
    setUser(null);
    setOriginalAdminUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATE_STORAGE_KEY);
  };

  const forgotPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const clients = db.getClients();
    const profiles = JSON.parse(localStorage.getItem('payment_portal_profiles') || '[]') as Profile[];

    const exists =
      profiles.some((p) => p.email.toLowerCase() === cleanEmail) ||
      clients.some((c) => c.email.toLowerCase() === cleanEmail) ||
      cleanEmail === INITIAL_SUPER_ADMIN.email.toLowerCase();

    if (exists) {
      return {
        success: true,
        message:
          'A password reset verification link has been dispatched to your email address. Please check your inbox.',
      };
    }
    return {
      success: false,
      message: 'No account associated with this email address was found.',
    };
  };

  const impersonateClient = (client: Client) => {
    if (!user || user.role === 'client') return;

    // Save current admin
    setOriginalAdminUser(user);
    localStorage.setItem(IMPERSONATE_STORAGE_KEY, JSON.stringify(user));

    // Switch to client
    const clientUser: AuthUser = {
      id: client.user_id || client.id,
      clientId: client.id,
      full_name: client.full_name,
      email: client.email,
      role: 'client',
      phone: client.phone,
    };

    setUser(clientUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(clientUser));
  };

  const stopImpersonation = () => {
    if (!originalAdminUser) return;
    setUser(originalAdminUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(originalAdminUser));
    setOriginalAdminUser(null);
    localStorage.removeItem(IMPERSONATE_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        forgotPassword,
        impersonateClient,
        stopImpersonation,
        isImpersonating: Boolean(originalAdminUser),
        originalAdminUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
