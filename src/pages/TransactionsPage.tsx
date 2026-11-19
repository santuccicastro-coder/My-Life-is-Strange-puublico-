import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import { auth } from '../firebase';
import type { Transaction, TransactionStatus, TransactionType } from '../types/finance';
import { formatBRL, formatDateBR, formatMonthFull, getHouseholdPeople } from '../utils/financeCalculations';

interface TransactionsPageProps {
  onQuickAdd: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function TransactionsPage({ onQuickAdd, onEditTransaction }: TransactionsPageProps) {
  const { household, transactions, toggleTransactionStatus, deleteTransaction } = useFinance();

  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPerson, setFilterPerson] = useState<string>('ALL');
  const [exporting, setExporting] = useState(false);

  const availableMonths = useMemo(() => {
    const set = new Set<string>(transactions.map((t) => t.monthKey));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const peopleOptions = useMemo(() => {
    const base = household ? getHouseholdPeople(household) : [];
    const fromData = transactions.map((t) => t.person);
    return Array.from(new Set([...base, ...fromData]));
  }, [household, transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filterMonth !== 'ALL' && tx.monthKey !== filterMonth) return false;
      if (filterType !== 'ALL' && tx.type !== (filterType as TransactionType)) return false;
      if (filterStatus !== 'ALL' && tx.status !== (filterStatus as TransactionStatus)) return false;
      if (filterPerson !== 'ALL' && tx.person !== filterPerson) return false;
      if (
        q &&
        !tx.description.toLowerCase().includes(q) &&
        !tx.category.toLowerCase().includes(q) &&
        !tx.accountOrCard.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [transactions, search, filterMonth, filterType, filterStatus, filterPerson]);

  const totals = useMemo(() => {
    let entries = 0;
    let expenses = 0;
    let savings = 0;
    for (const tx of filtered) {
      if (tx.type === 'Entrada') entries += tx.actualAmount;
      else if (tx.type === 'Saída') expenses += tx.actualAmount;
      else if (tx.type === 'Economia') savings += tx.actualAmount;
    }
    return { entries, expenses, savings };
  }, [filtered]);

  const handleDelete = async (tx: Transaction) => {
    await deleteTransaction(tx.id);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sessão expirada.');
      const res = await fetch('/api/export-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: filtered }),
      });
      if (!res.ok) throw new Error('Falha ao exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lancamentos-${filterMonth === 'ALL' ? 'todos' : filterMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Lançamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Movimentações do dia a dia. Salários fixos ficam em Renda e parcelamentos em Parcelamentos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
          {filtered.length > 0 && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
          )}
          <button
            type="button"
            onClick={onQuickAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo lançamento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar descrição, categoria ou conta..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="ALL">Todos os meses</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthFull(m)}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="ALL">Todos os tipos</option>
            <option value="Saída">Despesas</option>
            <option value="Entrada">Receitas extras</option>
            <option value="Economia">Economias</option>
            <option value="Transferência">Transferências</option>
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full min-w-0 px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">Situação</option>
              <option value="Pago">Realizado</option>
              <option value="Pendente">Pendente</option>
            </select>
            <select
              value={filterPerson}
              onChange={(e) => setFilterPerson(e.target.value)}
              className="w-full min-w-0 px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">Pessoa</option>
              {peopleOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <span>
            {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Receitas: <strong className="font-mono tabular-nums text-emerald-700">{formatBRL(totals.entries)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Despesas: <strong className="font-mono tabular-nums text-slate-900">{formatBRL(totals.expenses)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Economias: <strong className="font-mono tabular-nums text-sky-700">{formatBRL(totals.savings)}</strong>
          </span>
        </div>
      </div>

      {/* Lista / Tabela */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700">Nenhum lançamento encontrado com os filtros atuais.</p>
          <p className="text-xs text-slate-500">Registre uma despesa, receita extra ou reserva para acompanhar o mês.</p>
          <button
            type="button"
            onClick={onQuickAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar lançamento
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleTransactionStatus(tx)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                          tx.status === 'Pago' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {tx.status === 'Pago' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                        {tx.status === 'Pago' ? 'Realizado' : 'Pendente'}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-400">
                        {tx.type === 'Saída' ? 'Despesa' : tx.type === 'Entrada' ? 'Receita' : tx.type} · Lançado por {tx.createdByName}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{tx.category}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {tx.paymentMethod} · {tx.accountOrCard}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{tx.person}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          tx.type === 'Entrada'
                            ? 'text-emerald-700'
                            : tx.type === 'Economia'
                            ? 'text-sky-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {tx.type === 'Entrada' ? '+' : tx.type === 'Saída' ? '−' : ''} {formatBRL(tx.actualAmount)}
                      </span>
                      {tx.plannedAmount !== tx.actualAmount && (
                        <p className="text-[11px] font-mono tabular-nums text-slate-400">
                          Prev: {formatBRL(tx.plannedAmount)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditTransaction(tx)}
                          title="Editar"
                          className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx)}
                          title="Excluir"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-100">
            {filtered.map((tx) => (
              <div key={tx.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{tx.description}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateBR(tx.date)} · {tx.category} · {tx.person}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                      tx.type === 'Entrada' ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {tx.type === 'Entrada' ? '+' : tx.type === 'Saída' ? '−' : ''} {formatBRL(tx.actualAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleTransactionStatus(tx)}
                    className={`min-w-0 flex-1 inline-flex items-center gap-1 text-xs font-medium text-left cursor-pointer ${
                      tx.status === 'Pago' ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {tx.status === 'Pago' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">
                      {tx.status === 'Pago' ? 'Realizado' : 'Pendente'} · {tx.paymentMethod} · {tx.accountOrCard}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tx)}
                      className="p-1.5 text-slate-500 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
