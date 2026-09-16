import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  QrCode,
  Users,
  Link as LinkIcon,
  Activity,
  ArrowUpRight,
  TrendingUp,
  ReceiptText,
  Plus,
} from 'lucide-react';
import { db } from '../../services/db';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../lib/utils';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState(() => db.getDashboardStats());

  useEffect(() => {
    const refresh = async () => {
      setStats(db.getDashboardStats());
      try {
        await db.syncAccountsFromCloud();
        setStats(db.getDashboardStats());
      } catch {
        // Fallback to local
      }
    };

    refresh();

    const handleUpdate = () => {
      setStats(db.getDashboardStats());
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    const unsubFirestore = db.subscribeToRealtimeUpdates(() => {
      refresh();
    });

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      unsubFirestore();
    };
  }, []);

  const summaryCards = [
    {
      title: 'Total Bank Accounts',
      value: stats.totalBankAccounts,
      sub: `${stats.activeBankAccounts} Active • ${stats.inactiveBankAccounts} Inactive`,
      icon: Building2,
      color: 'text-blue-600 bg-blue-50',
      link: '/admin/banks',
    },
    {
      title: 'Active Bank Accounts',
      value: stats.activeBankAccounts,
      sub: 'Visible on Client Portal',
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-50',
      link: '/admin/banks',
    },
    {
      title: 'Inactive Bank Accounts',
      value: stats.inactiveBankAccounts,
      sub: 'Hidden from client view',
      icon: Building2,
      color: 'text-slate-600 bg-slate-100',
      link: '/admin/banks',
    },
    {
      title: 'Total UPI IDs',
      value: stats.totalUpiIds,
      sub: `${stats.activeUpiIds} Active • ${stats.inactiveUpiIds} Inactive`,
      icon: QrCode,
      color: 'text-indigo-600 bg-indigo-50',
      link: '/admin/upis',
    },
    {
      title: 'Active UPI IDs',
      value: stats.activeUpiIds,
      sub: 'Visible on Client Portal',
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-50',
      link: '/admin/upis',
    },
    {
      title: 'Inactive UPI IDs',
      value: stats.inactiveUpiIds,
      sub: 'Offline / Maintenance',
      icon: QrCode,
      color: 'text-slate-600 bg-slate-100',
      link: '/admin/upis',
    },
    {
      title: 'Total Clients',
      value: stats.totalClients,
      sub: `${stats.activeClients} Active Clients`,
      icon: Users,
      color: 'text-sky-600 bg-sky-50',
      link: '/admin/clients',
    },
    {
      title: 'Active Clients',
      value: stats.activeClients,
      sub: 'Granted portal access',
      icon: Users,
      color: 'text-emerald-600 bg-emerald-50',
      link: '/admin/clients',
    },
    {
      title: "Today's Payment Links",
      value: stats.todayPaymentLinks,
      sub: 'Generated link requests',
      icon: LinkIcon,
      color: 'text-violet-600 bg-violet-50',
      link: '/admin/payment-links',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payment Operations Overview</h2>
          <p className="text-sm text-slate-500 mt-1">
            Real-time status of corporate bank accounts, active UPI endpoints, and client accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/admin/banks">
            <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Bank
            </Button>
          </Link>
          <Link to="/admin/upis">
            <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add UPI
            </Button>
          </Link>
          <Link to="/admin/clients">
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Client
            </Button>
          </Link>
        </div>
      </div>

      {/* Pending Confirmation Alert Banner */}
      {stats.pendingConfirmationLinks > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-sm text-amber-950 block">
                {stats.pendingConfirmationLinks} Payment Confirmation{stats.pendingConfirmationLinks > 1 ? 's' : ''} Pending Review
              </span>
              <p className="text-xs text-amber-800 mt-0.5">
                Clients have submitted payment screenshots. Review proof and settle transactions.
              </p>
            </div>
          </div>
          <Link to="/admin/payment-links">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto">
              Review & Settle Payments
            </Button>
          </Link>
        </div>
      )}

      {/* Grid of 9 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link key={idx} to={card.link} className="block group">
              <Card className="h-full hover:border-blue-300 hover:shadow-md transition-all">
                <CardContent className="p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {card.title}
                    </p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight group-hover:text-blue-600 transition-colors">
                      {card.value}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl shrink-0 ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Two Column Section: Recent Activity & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <CardTitle>Recent Activity</CardTitle>
            </div>
            <Link
              to="/admin/activity-logs"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {stats.recentActivity.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No activity recorded yet.</div>
              ) : (
                stats.recentActivity.map((log) => (
                  <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-50/70 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 truncate">{log.action}</p>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{log.details}</p>
                      <span className="text-[10px] text-slate-400 font-medium">By {log.user_name}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-emerald-600" />
              <CardTitle>Recent Transactions</CardTitle>
            </div>
            <Link
              to="/admin/transactions"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {stats.recentTransactions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No transactions recorded.</div>
              ) : (
                stats.recentTransactions.map((tx) => (
                  <div key={tx.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{tx.client_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {tx.method} • Ref: {tx.reference_no}
                      </p>
                      <span className="text-[10px] text-slate-400">{formatDate(tx.created_at)}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(tx.amount)}</p>
                      <Badge variant={tx.status === 'Completed' ? 'active' : 'pending'}>
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
