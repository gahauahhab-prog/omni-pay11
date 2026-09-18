import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AdminLayout } from './components/layouts/AdminLayout';
import { ClientLayout } from './components/layouts/ClientLayout';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { PaymentCheckoutPage } from './pages/public/PaymentCheckoutPage';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { BankAndUpiPage } from './pages/admin/BankAndUpiPage';
import { BankAccountsPage } from './pages/admin/BankAccountsPage';
import { UpiAccountsPage } from './pages/admin/UpiAccountsPage';
import { ClientsPage } from './pages/admin/ClientsPage';
import { PaymentLinksPage } from './pages/admin/PaymentLinksPage';
import { TransactionsPage } from './pages/admin/TransactionsPage';
import { ActivityLogsPage } from './pages/admin/ActivityLogsPage';
import { SettingsPage } from './pages/admin/SettingsPage';

// Client Pages
import { ClientDashboard } from './pages/client/ClientDashboard';
import { ClientManageLinksPage } from './pages/client/ClientManageLinksPage';
import { ClientHistoryPage } from './pages/client/ClientHistoryPage';
import { ClientSupportPage } from './pages/client/ClientSupportPage';

// Protected Route for Admins
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Clients cannot access admin routes
  if (user.role === 'client') {
    return <Navigate to="/client/dashboard" replace />;
  }

  return <>{children}</>;
};

// Protected Route for Clients
const ClientRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, isImpersonating } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admins can view client routes (e.g. preview or impersonating)
  return <>{children}</>;
};

// Index route switcher
const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'client') {
    return <Navigate to="/client/dashboard" replace />;
  }

  return <Navigate to="/admin/dashboard" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/pay/:linkId" element={<PaymentCheckoutPage />} />

            {/* Admin Portal Routes (Single AdminLayout) */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="banks-upi" element={<BankAndUpiPage />} />
              <Route path="banks" element={<BankAndUpiPage defaultTab="banks" />} />
              <Route path="upis" element={<BankAndUpiPage defaultTab="upis" />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="payment-links" element={<PaymentLinksPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="activity-logs" element={<ActivityLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Client Portal Routes (Single ClientLayout) */}
            <Route
              path="/client"
              element={
                <ClientRoute>
                  <ClientLayout />
                </ClientRoute>
              }
            >
              <Route index element={<Navigate to="/client/dashboard" replace />} />
              <Route path="dashboard" element={<ClientDashboard />} />
              <Route path="manage-links" element={<ClientManageLinksPage />} />
              <Route path="history" element={<ClientHistoryPage />} />
              <Route path="support" element={<ClientSupportPage />} />
            </Route>

            {/* Index & Fallback */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
