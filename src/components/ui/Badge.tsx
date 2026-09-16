import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'active' | 'inactive' | 'pending' | 'paid' | 'expired' | 'blue' | 'purple' | 'slate' | 'review' | 'rejected';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'slate', className }) => {
  const variantStyles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    inactive: 'bg-slate-100 text-slate-600 border-slate-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200/80',
    review: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    expired: 'bg-rose-50 text-rose-700 border-rose-200/80',
    rejected: 'bg-rose-100 text-rose-800 border-rose-300',
    blue: 'bg-blue-50 text-blue-700 border-blue-200/80',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
        variantStyles[variant],
        className
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'active' || variant === 'paid'
            ? 'bg-emerald-500'
            : variant === 'pending' || variant === 'review'
            ? 'bg-amber-500 animate-pulse'
            : variant === 'expired' || variant === 'rejected'
            ? 'bg-rose-500'
            : variant === 'blue'
            ? 'bg-blue-500'
            : variant === 'purple'
            ? 'bg-indigo-500'
            : 'bg-slate-400'
        )}
      />
      {children}
    </span>
  );
};
