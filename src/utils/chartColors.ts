export const SEMANTIC_COLORS = {
  // Verde -> Positivo (entradas, sobra positiva, melhora, reservas)
  positive: '#16A34A',
  positiveBright: '#22C55E',
  positiveSoft: '#4ADE80',
  // Vermelho -> Negativo (despesas, déficit, estouro)
  negative: '#DC2626',
  negativeBright: '#EF4444',
  negativeSoft: '#F87171',
  // Laranja e Amarelo -> Situações em melhora, piora gradual, alerta e simulações
  orangeDeep: '#EA580C',
  orange: '#F97316',
  orangeLight: '#FB923C',
  amber: '#D97706',
  yellow: '#EAB308',
  yellowBright: '#FACC15',
} as const;

// Paleta semântica para "Para onde foi o dinheiro" e gráficos multi-séries:
// transita entre Verde (gasto controlado / essencial equilibrado), Amarelo/Laranja (atenção / melhora-piora) e Vermelho (maior peso / crítico)
export const SEMANTIC_CATEGORY_PALETTE = [
  '#DC2626', // Vermelho (maior categoria / pressão)
  '#EA580C', // Laranja intenso (piora / atenção alta)
  '#F97316', // Laranja médio
  '#EAB308', // Amarelo (em observação / transição)
  '#FACC15', // Amarelo claro
  '#FB923C', // Laranja suave
  '#EF4444', // Vermelho vivo
  '#16A34A', // Verde (equilibrado / positivo)
  '#22C55E', // Verde claro
  '#D97706', // Âmbar
  '#4ADE80', // Verde suave
] as const;

export function getSemanticCategoryColor(index: number, shareRatio?: number): string {
  if (typeof shareRatio === 'number') {
    if (shareRatio >= 0.3) return SEMANTIC_COLORS.negative;
    if (shareRatio >= 0.18) return SEMANTIC_COLORS.orangeDeep;
    if (shareRatio >= 0.1) return SEMANTIC_COLORS.yellow;
    if (shareRatio >= 0.05) return SEMANTIC_COLORS.orangeLight;
    return SEMANTIC_COLORS.positive;
  }
  return SEMANTIC_CATEGORY_PALETTE[index % SEMANTIC_CATEGORY_PALETTE.length];
}

export function getLimitUsageColor(pct: number): {
  barHex: string;
  badgeClass: string;
  label: string;
} {
  if (pct >= 90) {
    return {
      barHex: SEMANTIC_COLORS.negative,
      badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
      label: 'Crítico',
    };
  }
  if (pct >= 75) {
    return {
      barHex: SEMANTIC_COLORS.orangeDeep,
      badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900',
      label: 'Piora / Alto',
    };
  }
  if (pct >= 50) {
    return {
      barHex: SEMANTIC_COLORS.yellow,
      badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-900',
      label: 'Atenção',
    };
  }
  return {
    barHex: SEMANTIC_COLORS.positive,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    label: 'Saudável',
  };
}

export function getChartTheme(isDark: boolean) {
  return {
    gridStroke: isDark ? '#1E293B' : '#E2E8F0',
    axisTick: isDark ? '#94A3B8' : '#64748B',
    tooltipStyle: {
      borderRadius: 12,
      border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 12,
    } as React.CSSProperties,
    legendStyle: {
      fontSize: 12,
      color: isDark ? '#CBD5E1' : '#334155',
    } as React.CSSProperties,
  };
}

export const CHART_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 450,
  animationEasing: 'ease-out' as const,
};

