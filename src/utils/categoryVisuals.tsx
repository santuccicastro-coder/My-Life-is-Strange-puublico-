import React from 'react';
import {
  Briefcase,
  Building2,
  Car,
  Coffee,
  Coins,
  CreditCard,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Package,
  PiggyBank,
  Plane,
  Receipt,
  RefreshCw,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smile,
  Sparkles,
  TrendingUp,
  Tv,
  UserCheck,
  Utensils,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';
import type { TransactionType } from '../types/finance';

export interface CategoryIconOption {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: 'Home', label: 'Casa', Icon: Home },
  { key: 'Utensils', label: 'Alimentação', Icon: Utensils },
  { key: 'ShoppingCart', label: 'Mercado', Icon: ShoppingCart },
  { key: 'Car', label: 'Transporte', Icon: Car },
  { key: 'HeartPulse', label: 'Saúde', Icon: HeartPulse },
  { key: 'GraduationCap', label: 'Educação', Icon: GraduationCap },
  { key: 'Smile', label: 'Lazer', Icon: Smile },
  { key: 'ShoppingBag', label: 'Compras', Icon: ShoppingBag },
  { key: 'Repeat', label: 'Assinaturas', Icon: Repeat },
  { key: 'Receipt', label: 'Contas / Boleto', Icon: Receipt },
  { key: 'Landmark', label: 'Impostos / Banco', Icon: Landmark },
  { key: 'Zap', label: 'Energia / Água', Icon: Zap },
  { key: 'Wrench', label: 'Manutenção', Icon: Wrench },
  { key: 'CreditCard', label: 'Cartão', Icon: CreditCard },
  { key: 'Briefcase', label: 'Trabalho CLT', Icon: Briefcase },
  { key: 'UserCheck', label: 'Autônomo', Icon: UserCheck },
  { key: 'Building2', label: 'Empresa', Icon: Building2 },
  { key: 'Laptop', label: 'Freelance', Icon: Laptop },
  { key: 'Coins', label: 'Mesada / Dinheiro', Icon: Coins },
  { key: 'Gift', label: 'Benefícios / Presente', Icon: Gift },
  { key: 'TrendingUp', label: 'Rendimentos', Icon: TrendingUp },
  { key: 'RefreshCw', label: 'Reembolsos', Icon: RefreshCw },
  { key: 'Wallet', label: 'Carteira / Receita', Icon: Wallet },
  { key: 'PiggyBank', label: 'Reserva', Icon: PiggyBank },
  { key: 'Plane', label: 'Viagem', Icon: Plane },
  { key: 'Coffee', label: 'Café / Restaurante', Icon: Coffee },
  { key: 'Tv', label: 'Entretenimento', Icon: Tv },
  { key: 'Gamepad2', label: 'Jogos', Icon: Gamepad2 },
  { key: 'Heart', label: 'Família / Pet', Icon: Heart },
  { key: 'ShieldCheck', label: 'Seguros', Icon: ShieldCheck },
  { key: 'Package', label: 'Outros', Icon: Package },
];

const ICON_BY_KEY = new Map(CATEGORY_ICON_OPTIONS.map((o) => [o.key, o.Icon]));

interface CategoryVisual {
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  textClass: string;
}

function resolveCustomIconComponent(
  category: string,
  customIcons?: Record<string, string>
): React.ComponentType<{ className?: string }> | null {
  if (!customIcons) return null;
  const direct = customIcons[category];
  if (direct && ICON_BY_KEY.has(direct)) return ICON_BY_KEY.get(direct)!;
  const target = category.toLowerCase().trim();
  for (const [k, iconKey] of Object.entries(customIcons)) {
    if (k.toLowerCase().trim() === target && ICON_BY_KEY.has(iconKey)) {
      return ICON_BY_KEY.get(iconKey)!;
    }
  }
  return null;
}

export function getCategoryVisual(
  category: string,
  type?: TransactionType,
  customIcons?: Record<string, string>
): CategoryVisual {
  const normalized = category.toLowerCase().trim();
  const customIcon = resolveCustomIconComponent(category, customIcons);

  if (type === 'Entrada') {
    let icon: React.ComponentType<{ className?: string }> = customIcon ?? Landmark;
    if (!customIcon) {
      if (normalized.includes('clt') || normalized.includes('salár') || normalized.includes('salar')) icon = Briefcase;
      else if (normalized.includes('autônom') || normalized.includes('autonom')) icon = UserCheck;
      else if (normalized.includes('empresa')) icon = Building2;
      else if (normalized.includes('freela')) icon = Laptop;
      else if (normalized.includes('mesada')) icon = Coins;
      else if (normalized.includes('benef')) icon = Gift;
      else if (normalized.includes('rendiment') || normalized.includes('invest')) icon = TrendingUp;
      else if (normalized.includes('reembols')) icon = RefreshCw;
      else if (normalized.includes('outra')) icon = Wallet;
    }
    return {
      icon,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }

  if (type === 'Economia') {
    return {
      icon: customIcon ?? PiggyBank,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (type === 'Transferência') {
    return {
      icon: customIcon ?? Wallet,
      bgClass: 'bg-slate-200 dark:bg-slate-800',
      textClass: 'text-slate-700 dark:text-slate-300',
    };
  }

  if (normalized.includes('mercado') || normalized.includes('aliment') || normalized.includes('restaur') || normalized.includes('diária')) {
    return {
      icon: customIcon ?? (normalized.includes('mercado') ? ShoppingCart : Utensils),
      bgClass: 'bg-orange-100 dark:bg-orange-950/60',
      textClass: 'text-orange-600 dark:text-orange-400',
    };
  }
  if (normalized.includes('saúde') || normalized.includes('saude') || normalized.includes('farm') || normalized.includes('médic')) {
    return {
      icon: customIcon ?? HeartPulse,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (normalized.includes('moradia') || normalized.includes('casa') || normalized.includes('aluguel')) {
    return {
      icon: customIcon ?? Home,
      bgClass: 'bg-slate-100 dark:bg-slate-800',
      textClass: 'text-slate-700 dark:text-slate-300',
    };
  }
  if (normalized.includes('doméstic') || normalized.includes('domestic') || normalized.includes('conta')) {
    return {
      icon: customIcon ?? Receipt,
      bgClass: 'bg-sky-100 dark:bg-sky-950/60',
      textClass: 'text-sky-700 dark:text-sky-400',
    };
  }
  if (normalized.includes('impost') || normalized.includes('taxa') || normalized.includes('tribut')) {
    return {
      icon: customIcon ?? Landmark,
      bgClass: 'bg-red-100 dark:bg-red-950/50',
      textClass: 'text-red-600 dark:text-red-400',
    };
  }
  if (normalized.includes('transp') || normalized.includes('uber') || normalized.includes('combust') || normalized.includes('carro')) {
    return {
      icon: customIcon ?? Car,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (normalized.includes('educa') || normalized.includes('curso') || normalized.includes('livro')) {
    return {
      icon: customIcon ?? GraduationCap,
      bgClass: 'bg-sky-100 dark:bg-sky-950/60',
      textClass: 'text-sky-700 dark:text-sky-400',
    };
  }
  if (normalized.includes('assinat') || normalized.includes('stream') || normalized.includes('internet')) {
    return {
      icon: customIcon ?? Repeat,
      bgClass: 'bg-amber-100 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-400',
    };
  }
  if (normalized.includes('lazer') || normalized.includes('viag') || normalized.includes('entreten')) {
    return {
      icon: customIcon ?? Smile,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (normalized.includes('compra')) {
    return {
      icon: customIcon ?? ShoppingBag,
      bgClass: 'bg-red-100 dark:bg-red-950/50',
      textClass: 'text-red-600 dark:text-red-400',
    };
  }
  if (normalized.includes('cart') || normalized.includes('fatura')) {
    return {
      icon: customIcon ?? CreditCard,
      bgClass: 'bg-slate-200 dark:bg-slate-800',
      textClass: 'text-slate-800 dark:text-slate-200',
    };
  }
  if (normalized.includes('invest') || normalized.includes('poupan') || normalized.includes('cofrinho')) {
    return {
      icon: customIcon ?? PiggyBank,
      bgClass: 'bg-emerald-100 dark:bg-emerald-950/60',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }

  return {
    icon: customIcon ?? (normalized ? Package : Sparkles),
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-700 dark:text-slate-300',
  };
}

export function CategoryBadgeIcon({
  category,
  type,
  size = 'md',
  customIcons,
}: {
  category: string;
  type?: TransactionType;
  size?: 'sm' | 'md';
  customIcons?: Record<string, string>;
}) {
  const { icon: Icon, bgClass, textClass } = getCategoryVisual(category, type, customIcons);
  const boxClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div className={`${boxClass} ${bgClass} ${textClass} rounded-full flex items-center justify-center shrink-0`}>
      <Icon className={iconClass} />
    </div>
  );
}
