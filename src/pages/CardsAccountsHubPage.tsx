import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import type { AppRoute, BankAccount, BankAccountType, CardsAccountsTab } from '../types/finance';
import {
  formatBRL,
  getCurrentMonthKey,
  getCardInvoiceInMonth,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';
import { CardsPage } from './CardsPage';
import { RecurringPage } from './RecurringPage';

interface CardsAccountsHubPageProps {
  onNavigate: (route: AppRoute) => void;
  initialTab?: CardsAccountsTab;
}

export function CardsAccountsHubPage({ onNavigate, initialTab = 'cartoes' }: CardsAccountsHubPageProps) {
  const {
    bankAccounts,
    cards,
    transactions,
    installments,
    recurringItems,
    saveBankAccount,
    deleteBankAccount,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<CardsAccountsTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Modal de Conta Bancária
  const [accFormOpen, setAccFormOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accType, setAccType] = useState<BankAccountType>('Corrente');
  const [accBalance, setAccBalance] = useState('');
  const [accSaving, setAccSaving] = useState(false);
  const [accError, setAccError] = useState('');

  const currentMonthKey = getCurrentMonthKey();

  const totalAccountsBalance = useMemo(
    () => bankAccounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0),
    [bankAccounts]
  );

  const totalOpenInvoices = useMemo(
    () =>
      cards
        .filter((c) => c.active)
        .reduce(
          (s, c) => s + getCardInvoiceInMonth(c, currentMonthKey, transactions, installments, recurringItems).remainingAmount,
          0
        ),
    [cards, currentMonthKey, transactions, installments, recurringItems]
  );

  const openAccountForm = (acc?: BankAccount) => {
    setEditingAcc(acc ?? null);
    setAccName(acc?.name ?? '');
    setAccInstitution(acc?.institution ?? '');
    setAccType(acc?.type ?? 'Corrente');
    setAccBalance(acc ? String(acc.balance) : '');
    setAccError('');
    setAccFormOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccError('');
    const parsedBal = parseSignedDecimal(accBalance);
    if (!accName.trim() || !Number.isFinite(parsedBal)) {
      setAccError('Informe o nome da conta e um saldo válido.');
      return;
    }
    setAccSaving(true);
    try {
      await saveBankAccount(
        {
          name: accName.trim(),
          institution: accInstitution.trim() || 'Manual',
          type: accType,
          balance: parsedBal,
          annualYieldRate: editingAcc?.annualYieldRate,
          currency: 'BRL',
          lastSyncedAt: new Date().toISOString(),
          active: true,
        },
        editingAcc?.id
      );
      setAccFormOpen(false);
      setEditingAcc(null);
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Erro ao salvar conta.');
    } finally {
      setAccSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Abas internas: Cartões e Faturas | Contas Bancárias | Contas Fixas */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'cartoes', label: 'Cartões e Faturas', icon: CreditCard },
            { id: 'contas', label: 'Contas Bancárias', icon: Landmark },
            { id: 'fixos', label: 'Contas Fixas', icon: Repeat },
          ] as Array<{ id: CardsAccountsTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'cartoes' && (
        <div key="tab-cartoes" className="duofin-tab-enter">
          <CardsPage />
        </div>
      )}

      {activeTab === 'fixos' && (
        <div key="tab-fixos" className="duofin-tab-enter">
          <RecurringPage onNavigate={onNavigate} />
        </div>
      )}

      {activeTab === 'contas' && (
        <div key="tab-contas" className="duofin-tab-enter space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Contas Bancárias e Carteiras
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Gerencie os saldos reais de cada conta e carteira conectados ao Início e ao Horizonte.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAccountForm()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Adicionar conta
            </button>
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-300">Saldo consolidado em contas</span>
              <p
                className={`text-2xl font-bold font-mono tabular-nums ${
                  totalAccountsBalance < 0 ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                {formatBRL(totalAccountsBalance)}
              </p>
              <p className="text-[11px] text-slate-400">
                {bankAccounts.filter((a) => a.active).length} conta(s) ativa(s)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Faturas em aberto no mês</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-600">
                {formatBRL(totalOpenInvoices)}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('cartoes')}
                className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Abrir faturas e vencimentos &rsaquo;
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Contas fixas mensais</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {recurringItems.filter((r) => r.active && r.type === 'Saída').length} ativa(s)
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('fixos')}
                className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Gerenciar despesas fixas &rsaquo;
              </button>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Suas contas e carteiras
              </span>
            </div>

            {bankAccounts.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Landmark className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-700">
                  Nenhuma conta bancária cadastrada ainda.
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Adicione conta corrente, poupança ou carteira para acompanhar seu saldo disponível real.
                </p>
                <button
                  type="button"
                  onClick={() => openAccountForm()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cadastrar primeira conta
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-100 flex items-center justify-center shrink-0">
                        <Landmark className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{acc.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {acc.institution} · {acc.type}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          acc.balance >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {formatBRL(acc.balance)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openAccountForm(acc)}
                        aria-label={`Editar ${acc.name}`}
                        className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBankAccount(acc.id)}
                        aria-label={`Excluir ${acc.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal Conta Bancária */}
      {accFormOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAccFormOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 p-5 space-y-4 max-h-[88dvh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-semibold text-slate-900">
                  {editingAcc ? 'Editar conta bancária' : 'Nova conta / saldo atual'}
                </h3>
                <button
                  type="button"
                  onClick={() => setAccFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveAccount} className="space-y-3">
                {accError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {accError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nome da conta</label>
                  <input
                    type="text"
                    required
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="Ex.: Nubank, Itaú, Carteira"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Instituição</label>
                    <input
                      type="text"
                      value={accInstitution}
                      onChange={(e) => setAccInstitution(e.target.value)}
                      placeholder="Ex.: Nubank"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                    <select
                      value={accType}
                      onChange={(e) => setAccType(e.target.value as BankAccountType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Corrente">Corrente</option>
                      <option value="Poupança">Poupança</option>
                      <option value="Carteira">Carteira</option>
                      <option value="Investimento">Investimento</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Saldo atual (R$)</label>
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = accBalance.trimStart();
                        setAccBalance(trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`);
                      }}
                      className="min-w-[42px] px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold font-mono cursor-pointer"
                    >
                      {accBalance.startsWith('-') ? '−' : '+/−'}
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={accBalance}
                      onChange={(e) => setAccBalance(sanitizeSignedDecimalInput(e.target.value, true))}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAccFormOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={accSaving}
                    className="px-5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    {accSaving ? 'Salvando...' : 'Salvar conta'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
