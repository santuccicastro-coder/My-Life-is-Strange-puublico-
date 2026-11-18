import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Copy, Delete, Minus, Percent, Plus, RotateCcw, X } from 'lucide-react';
import { computeQuickInterest, formatBRL } from '../utils/financeCalculations';
import { ModalPortal } from './ModalPortal';

interface QuickCalculatorModalProps {
  open: boolean;
  onClose: () => void;
}

type CalcTab = 'rapida' | 'juros';
type BinaryOp = '+' | '−' | '×' | '÷';

function formatCalcNumber(value: string): string {
  if (!value) return '0';
  if (value === 'Erro') return 'Erro';
  const negative = value.startsWith('-');
  const clean = negative ? value.slice(1) : value;
  const [intPart, decPart] = clean.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const prefix = negative ? '−' : '';
  return decPart !== undefined ? `${prefix}${formattedInt},${decPart}` : `${prefix}${formattedInt}`;
}

function roundCalc(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 1e10) / 1e10;
}

function numToRaw(n: number): string {
  if (!Number.isFinite(n)) return 'Erro';
  const rounded = roundCalc(n);
  return String(rounded);
}

function applyBinaryOp(left: number, right: number, op: BinaryOp): number {
  switch (op) {
    case '+':
      return left + right;
    case '−':
      return left - right;
    case '×':
      return left * right;
    case '÷':
      return right === 0 ? NaN : left / right;
  }
}

export function QuickCalculatorModal({ open, onClose }: QuickCalculatorModalProps) {
  const [activeTab, setActiveTab] = useState<CalcTab>('rapida');

  // Estado da Calculadora Rápida (+ − × ÷ %) — estritamente SEM histórico
  const [display, setDisplay] = useState<string>('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<BinaryOp | null>(null);
  const [waitingForNext, setWaitingForNext] = useState<boolean>(false);
  const [expressionHint, setExpressionHint] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Estado da Calculadora de Juros (Simples / Compostos) — sem histórico
  const [regime, setRegime] = useState<'composto' | 'simples'>('composto');
  const [principalText, setPrincipalText] = useState<string>('1000');
  const [rateText, setRateText] = useState<string>('2,5');
  const [rateUnit, setRateUnit] = useState<'mensal' | 'anual'>('mensal');
  const [months, setMonths] = useState<number>(12);

  const interestResult = useMemo(() => {
    const principal = Number(principalText.replace(/\./g, '').replace(',', '.')) || 0;
    const ratePct = Number(rateText.replace(',', '.')) || 0;
    return computeQuickInterest({
      principal,
      ratePct,
      rateUnit,
      months,
      regime,
    });
  }, [principalText, rateText, rateUnit, months, regime]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOp(null);
    setWaitingForNext(false);
    setExpressionHint('');
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (display === 'Erro') {
        setDisplay(digit);
        setStoredValue(null);
        setPendingOp(null);
        setWaitingForNext(false);
        setExpressionHint('');
        return;
      }
      if (waitingForNext) {
        setDisplay(digit);
        setWaitingForNext(false);
        return;
      }
      if (display === '0') {
        setDisplay(digit);
        return;
      }
      if (display.replace(/[-.]/g, '').length >= 14) return;
      setDisplay((prev) => `${prev}${digit}`);
    },
    [display, waitingForNext]
  );

  const handleDecimal = useCallback(() => {
    if (display === 'Erro' || waitingForNext) {
      setDisplay('0.');
      setWaitingForNext(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => `${prev}.`);
    }
  }, [display, waitingForNext]);

  const handleBackspace = useCallback(() => {
    if (display === 'Erro' || waitingForNext) {
      setDisplay('0');
      setWaitingForNext(false);
      return;
    }
    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  }, [display, waitingForNext]);

  const handleToggleSign = useCallback(() => {
    if (display === 'Erro' || display === '0') return;
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : `-${prev}`));
  }, [display]);

  const handleOperator = useCallback(
    (op: BinaryOp) => {
      const current = Number(display);
      if (!Number.isFinite(current)) {
        handleClear();
        return;
      }
      if (storedValue !== null && pendingOp && !waitingForNext) {
        const nextVal = applyBinaryOp(storedValue, current, pendingOp);
        const raw = numToRaw(nextVal);
        setDisplay(raw);
        if (raw === 'Erro') {
          setStoredValue(null);
          setPendingOp(null);
          setExpressionHint('Divisão por zero');
          setWaitingForNext(true);
          return;
        }
        setStoredValue(Number(raw));
        setExpressionHint(`${formatCalcNumber(raw)} ${op}`);
      } else {
        setStoredValue(current);
        setExpressionHint(`${formatCalcNumber(display)} ${op}`);
      }
      setPendingOp(op);
      setWaitingForNext(true);
    },
    [display, storedValue, pendingOp, waitingForNext, handleClear]
  );

  const handlePercent = useCallback(() => {
    const current = Number(display);
    if (!Number.isFinite(current)) return;

    if (storedValue !== null && pendingOp) {
      const basePctValue = roundCalc((storedValue * current) / 100);
      if (pendingOp === '+' || pendingOp === '−') {
        const result =
          pendingOp === '+' ? storedValue + basePctValue : storedValue - basePctValue;
        const raw = numToRaw(result);
        setExpressionHint(
          `${formatCalcNumber(String(storedValue))} ${pendingOp} ${formatCalcNumber(display)}% (${formatCalcNumber(String(basePctValue))})`
        );
        setDisplay(raw);
        setStoredValue(null);
        setPendingOp(null);
        setWaitingForNext(true);
        return;
      }
      if (pendingOp === '×') {
        const raw = numToRaw(basePctValue);
        setExpressionHint(
          `${formatCalcNumber(display)}% de ${formatCalcNumber(String(storedValue))}`
        );
        setDisplay(raw);
        setStoredValue(null);
        setPendingOp(null);
        setWaitingForNext(true);
        return;
      }
      if (pendingOp === '÷') {
        const pctRatio = current / 100;
        const result = pctRatio === 0 ? NaN : storedValue / pctRatio;
        const raw = numToRaw(result);
        setExpressionHint(`${formatCalcNumber(String(storedValue))} ÷ ${formatCalcNumber(display)}%`);
        setDisplay(raw);
        setStoredValue(null);
        setPendingOp(null);
        setWaitingForNext(true);
        return;
      }
    }

    const standalone = roundCalc(current / 100);
    setExpressionHint(`${formatCalcNumber(display)}% em decimal`);
    setDisplay(numToRaw(standalone));
    setWaitingForNext(true);
  }, [display, storedValue, pendingOp]);

  const handleEquals = useCallback(() => {
    const current = Number(display);
    if (storedValue === null || !pendingOp || !Number.isFinite(current)) {
      return;
    }
    const result = applyBinaryOp(storedValue, current, pendingOp);
    const raw = numToRaw(result);
    setExpressionHint(
      raw === 'Erro'
        ? 'Divisão por zero'
        : `${formatCalcNumber(String(storedValue))} ${pendingOp} ${formatCalcNumber(display)} =`
    );
    setDisplay(raw);
    setStoredValue(null);
    setPendingOp(null);
    setWaitingForNext(true);
  }, [display, storedValue, pendingOp]);

  const applyQuickPercentDelta = useCallback(
    (pctDelta: number) => {
      const current = Number(display);
      if (!Number.isFinite(current)) return;
      const factor = 1 + pctDelta / 100;
      const result = roundCalc(current * factor);
      const sign = pctDelta >= 0 ? '+' : '−';
      setExpressionHint(`${formatCalcNumber(display)} ${sign} ${Math.abs(pctDelta)}%`);
      setDisplay(numToRaw(result));
      setStoredValue(null);
      setPendingOp(null);
      setWaitingForNext(true);
    },
    [display]
  );

  const handleCopyResult = async () => {
    const textToCopy =
      activeTab === 'rapida'
        ? formatCalcNumber(display)
        : formatBRL(interestResult.totalAmount);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (activeTab !== 'rapida') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === ',' || e.key === '.') {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handleOperator('−');
      } else if (e.key === '*') {
        e.preventDefault();
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        handlePercent();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    activeTab,
    onClose,
    handleDigit,
    handleDecimal,
    handleOperator,
    handlePercent,
    handleEquals,
    handleBackspace,
  ]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xs pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Calculadora econômica rápida"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="duofin-dialog-enter w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[82dvh]">

        {/* Cabeçalho */}
        <div className="px-4 pt-3 pb-2.5 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Calculadora econômica
              </h2>
              <p className="text-[11px] text-slate-500 truncate">Cálculo rápido · sem histórico</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopyResult}
              aria-label="Copiar resultado"
              title="Copiar resultado"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar calculadora"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alternador de modo: Rápida (+ − %) vs Juros */}
        <div className="px-4 pt-2.5">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('rapida')}
              className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'rapida'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              + − % Rápida
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('juros')}
              className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'juros'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Calcular Juros
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {activeTab === 'rapida' ? (
            <div key="rapida" className="duofin-tab-enter space-y-3">
              {/* Visor numérico sem histórico */}
              <div className="bg-slate-900 text-white rounded-2xl px-4 py-3 space-y-0.5 border border-slate-800">
                <p className="text-xs text-slate-400 font-mono tabular-nums min-h-[16px] text-right truncate">
                  {expressionHint || 'Digite ou use os atalhos de %'}
                </p>
                <p
                  data-testid="calc-display"
                  className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-right tracking-tight break-all"
                >
                  {formatCalcNumber(display)}
                </p>
              </div>

              {/* Atalhos rápidos de acréscimo / desconto percentual */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '−10%', delta: -10, tone: 'negative' },
                  { label: '−5%', delta: -5, tone: 'negative' },
                  { label: '+5%', delta: 5, tone: 'positive' },
                  { label: '+10%', delta: 10, tone: 'positive' },
                ].map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => applyQuickPercentDelta(shortcut.delta)}
                    className={`min-h-[40px] rounded-xl text-xs font-bold font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                      shortcut.tone === 'positive'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                        : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 hover:bg-red-100'
                    }`}
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>

              {/* Teclado tátil 4x5 */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-red-600 dark:text-red-400 font-bold text-base cursor-pointer active:scale-95 transition-transform"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  aria-label="Apagar último dígito"
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <Delete className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handlePercent}
                  aria-label="Porcentagem"
                  title="Calcula % (ex: 1000 − 15 % = 850)"
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <Percent className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleOperator('÷')}
                  aria-label="Dividir"
                  className={`min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl font-bold text-xl cursor-pointer active:scale-95 transition-transform ${
                    pendingOp === '÷' && waitingForNext
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  ÷
                </button>

                {['7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold font-mono text-xl cursor-pointer active:scale-95 transition-transform"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleOperator('×')}
                  aria-label="Multiplicar"
                  className={`min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl font-bold text-xl cursor-pointer active:scale-95 transition-transform ${
                    pendingOp === '×' && waitingForNext
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  ×
                </button>

                {['4', '5', '6'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold font-mono text-xl cursor-pointer active:scale-95 transition-transform"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleOperator('−')}
                  aria-label="Subtrair"
                  className={`min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl font-bold text-xl cursor-pointer active:scale-95 transition-transform ${
                    pendingOp === '−' && waitingForNext
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  −
                </button>

                {['1', '2', '3'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold font-mono text-xl cursor-pointer active:scale-95 transition-transform"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleOperator('+')}
                  aria-label="Somar"
                  className={`min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl font-bold text-xl cursor-pointer active:scale-95 transition-transform ${
                    pendingOp === '+' && waitingForNext
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={handleToggleSign}
                  aria-label="Inverter sinal"
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold text-base cursor-pointer active:scale-95 transition-transform"
                >
                  +/−
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit('0')}
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold font-mono text-xl cursor-pointer active:scale-95 transition-transform"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleDecimal}
                  aria-label="Vírgula decimal"
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold font-mono text-xl cursor-pointer active:scale-95 transition-transform"
                >
                  ,
                </button>
                <button
                  type="button"
                  onClick={handleEquals}
                  aria-label="Igual"
                  className="min-h-[46px] sm:min-h-[48px] rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-2xl cursor-pointer active:scale-95 transition-transform"
                >
                  =
                </button>
              </div>
            </div>
          ) : (
            /* Modo Juros Simples / Compostos — sem histórico */
            <div key="juros" className="duofin-tab-enter space-y-4">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setRegime('composto')}
                  className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    regime === 'composto'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Juros Compostos
                </button>
                <button
                  type="button"
                  onClick={() => setRegime('simples')}
                  className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    regime === 'simples'
                      ? 'bg-slate-900 dark:bg-slate-700 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Juros Simples
                </button>
              </div>

              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Valor inicial / Capital (R$)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={principalText}
                    onChange={(e) => setPrincipalText(e.target.value)}
                    placeholder="1000"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono tabular-nums text-base font-semibold"
                  />
                </label>

                <div className="grid grid-cols-12 gap-2 items-end">
                  <label className="col-span-7 block space-y-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Taxa de juros (%)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateText}
                      onChange={(e) => setRateText(e.target.value)}
                      placeholder="2,5"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono tabular-nums text-base font-semibold"
                    />
                  </label>
                  <div className="col-span-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 h-[44px]">
                    <button
                      type="button"
                      onClick={() => setRateUnit('mensal')}
                      className={`rounded-lg text-xs font-semibold cursor-pointer ${
                        rateUnit === 'mensal'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      a.m.
                    </button>
                    <button
                      type="button"
                      onClick={() => setRateUnit('anual')}
                      className={`rounded-lg text-xs font-semibold cursor-pointer ${
                        rateUnit === 'anual'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      a.a.
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prazo (meses)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMonths((m) => Math.max(1, m - 1))}
                      aria-label="Diminuir meses"
                      className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      inputMode="numeric"
                      value={months}
                      onChange={(e) => setMonths(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                      className="flex-1 min-h-[44px] px-3 py-2 text-center rounded-xl border border-slate-200 dark:border-slate-700 font-mono tabular-nums text-base font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setMonths((m) => Math.min(600, m + 1))}
                      aria-label="Aumentar meses"
                      className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Resultado instantâneo */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 border border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Montante final ({months}x)</p>
                    <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white mt-0.5">
                      {formatBRL(interestResult.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPrincipalText('0');
                      setRateText('0');
                      setMonths(12);
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Limpar
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-[10px] text-slate-400">Total de juros</p>
                    <p className="text-xs sm:text-sm font-bold font-mono tabular-nums text-amber-400 mt-0.5">
                      + {formatBRL(interestResult.totalInterest)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Acréscimo</p>
                    <p className="text-xs sm:text-sm font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
                      +{interestResult.increasePct.toFixed(1).replace('.', ',')}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Média / mês</p>
                    <p className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-200 mt-0.5">
                      {formatBRL(interestResult.monthlyEquivalent)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}
