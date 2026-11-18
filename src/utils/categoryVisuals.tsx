import React from 'react';
import {
  Car,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Package,
  PiggyBank,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Smile,
  Sparkles,
  Utensils,
  Wallet,
} from 'lucide-react';
import type { TransactionType } from '../types/finance';

interface CategoryVisual {
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  textClass: string;
}

export function getCategoryVisual(category: string, type?: TransactionType): CategoryVisual {
  const normalized = category.toLowerCase().trim();

  if (type === 'Entrada') {
    return {
      icon: Landmark,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (type === 'Economia') {
    return {
      icon: PiggyBank,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (type === 'Transferência') {
    return {
      icon: Wallet,
      bgClass: 'bg-slate-200 dark:bg-slate-800',
      textClass: 'text-slate-700 dark:text-slate-300',
    };
  }

  if (normalized.includes('mercado') || normalized.includes('aliment') || normalized.includes('restaur') || normalized.includes('diária')) {
    return {
      icon: normalized.includes('mercado') ? ShoppingCart : Utensils,
      bgClass: 'bg-orange-100 dark:bg-orange-950/60',
      textClass: 'text-orange-600 dark:text-orange-400',
    };
  }
  if (normalized.includes('saúde') || normalized.includes('saude') || normalized.includes('farm') || normalized.includes('médic')) {
    return {
      icon: HeartPulse,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (normalized.includes('moradia') || normalized.includes('casa') || normalized.includes('aluguel') || normalized.includes('conta')) {
    return {
      icon: Home,
      bgClass: 'bg-slate-100 dark:bg-slate-800',
      textClass: 'text-slate-700 dark:text-slate-300',
    };
  }
  if (normalized.includes('transp') || normalized.includes('uber') || normalized.includes('combust') || normalized.includes('carro')) {
    return {
      icon: Car,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (normalized.includes('educa') || normalized.includes('curso') || normalized.includes('livro')) {
    return {
      icon: GraduationCap,
      bgClass: 'bg-sky-100 dark:bg-sky-950/60',
      textClass: 'text-sky-700 dark:text-sky-400',
    };
  }
  if (normalized.includes('assinat') || normalized.includes('stream') || normalized.includes('internet')) {
    return {
      icon: Repeat,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (normalized.includes('lazer') || normalized.includes('viag') || normalized.includes('entreten')) {
    return {
      icon: Smile,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (normalized.includes('compra')) {
    return {
      icon: ShoppingBag,
      bgClass: 'bg-red-100 dark:bg-red-950/50',
      textClass: 'text-red-600 dark:text-red-400',
    };
  }
  if (normalized.includes('cart') || normalized.includes('fatura')) {
    return {
      icon: CreditCard,
      bgClass: 'bg-slate-200 dark:bg-slate-800',
      textClass: 'text-slate-800 dark:text-slate-200',
    };
  }
  if (normalized.includes('invest') || normalized.includes('poupan') || normalized.includes('cofrinho')) {
    return {
      icon: PiggyBank,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }

  return {
    icon: normalized ? Package : Sparkles,
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-700 dark:text-slate-300',
  };
}

export function CategoryBadgeIcon({
  category,
  type,
  size = 'md',
}: {
  category: string;
  type?: TransactionType;
  size?: 'sm' | 'md';
}) {
  const { icon: Icon, bgClass, textClass } = getCategoryVisual(category, type);
  const boxClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div className={`${boxClass} ${bgClass} ${textClass} rounded-full flex items-center justify-center shrink-0`}>
      <Icon className={iconClass} />
    </div>
  );
}
