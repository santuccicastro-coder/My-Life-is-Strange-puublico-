import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { PlannedPurchase, PlannedPurchaseStatus } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import { computePlannedPurchaseMetrics, formatBRL, formatDateBR } from '../utils/financeCalculations';

export function PlannedPurchasesPage({ embedded = false }: { embedded?: boolean }) {
  const { household, plannedPurchases, savePlannedPurchase, deletePlannedPurchase } = useFinance();

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterRoom, setFilterRoom] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedPurchase | null>(null);

  const [priority, setPriority] = useState('8');
  const [room, setRoom] = useState('Sala');
  const [product, setProduct] = useState('');
  const [brandModel, setBrandModel] = useState('');
  const [specs, setSpecs] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [estimatedUnitPrice, setEstimatedUnitPrice] = useState('');
  const [hasActualPrice, setHasActualPrice] = useState(false);
  const [actualUnitPrice, setActualUnitPrice] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Crédito');
  const [status, setStatus] = useState<PlannedPurchaseStatus>('Pendente');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const summary = useMemo(() => {
    let totalEstimated = 0;
    let totalPaid = 0;
    let totalDiff = 0;
    let pendingCount = 0;

    for (const item of plannedPurchases) {
      const m = computePlannedPurchaseMetrics(item);
      totalEstimated += m.totalEstimated;
      if (m.totalPaid !== null) totalPaid += m.totalPaid;
      if (m.difference !== null) totalDiff += m.difference;
      if (item.status === 'Pendente' || item.status === 'Pesquisando') pendingCount++;
    }
    return { totalEstimated, totalPaid, totalDiff, pendingCount };
  }, [plannedPurchases]);

  const filtered = useMemo(() => {
    return plannedPurchases
      .filter((item) => {
        if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
        if (filterRoom !== 'ALL' && item.room !== filterRoom) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority);
  }, [plannedPurchases, filterStatus, filterRoom]);

  const openNew = () => {
    setEditing(null);
    setPriority('8');
    setRoom(household?.rooms[0] ?? 'Sala');
    setProduct('');
    setBrandModel('');
    setSpecs('');
    setQuantity('1');
    setEstimatedUnitPrice('');
    setHasActualPrice(false);
    setActualUnitPrice('');
    setTargetDate('');
    setPurchaseDate('');
    setPaymentMethod(household?.paymentMethods[0] ?? 'Crédito');
    setStatus('Pendente');
    setNotes('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item: PlannedPurchase) => {
    setEditing(item);
    setPriority(String(item.priority));
    setRoom(item.room);
    setProduct(item.product);
    setBrandModel(item.brandModel);
    setSpecs(item.specs);
    setQuantity(String(item.quantity));
    setEstimatedUnitPrice(String(item.estimatedUnitPrice));
    setHasActualPrice(item.hasActualPrice);
    setActualUnitPrice(item.hasActualPrice ? String(item.actualUnitPrice) : '');
    setTargetDate(item.targetDate);
    setPurchaseDate(item.purchaseDate);
    setPaymentMethod(item.paymentMethod || 'Crédito');
    setStatus(item.status);
    setNotes(item.notes);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await savePlannedPurchase(
        {
          priority: Number(priority) || 5,
          room,
          product,
          brandModel,
          specs,
          quantity: Number(quantity) || 1,
          estimatedUnitPrice: Number(estimatedUnitPrice.replace(',', '.')) || 0,
          hasActualPrice,
          actualUnitPrice: hasActualPrice ? Number(actualUnitPrice.replace(',', '.')) || 0 : 0,
          targetDate,
          purchaseDate: status === 'Comprado' ? purchaseDate : '',
          paymentMethod,
          status,
          notes,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  if (!household) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          {embedded ? (
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Compras Planejadas</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compras Planejadas</h1>
          )}
          <p className="text-sm text-slate-500 mt-0.5">
            Itens que o casal pretende adquirir com prioridade (0–10), prazo e comparação entre preço previsto e pago.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Adicionar item
        </button>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Total previsto</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{formatBRL(summary.totalEstimated)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Total pago</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{formatBRL(summary.totalPaid)}</p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-300">Economia / Excesso</span>
          <p className={`text-2xl font-bold font-mono tabular-nums ${summary.totalDiff < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            {formatBRL(summary.totalDiff)}
          </p>
          <p className="text-xs text-slate-300">Positivo = pagou menos que o previsto</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Itens pendentes</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{summary.pendingCount}</p>
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="ALL">Todos os status</option>
          <option value="Pendente">Pendente</option>
          <option value="Pesquisando">Pesquisando</option>
          <option value="Comprado">Comprado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="ALL">Todos os ambientes</option>
          {household.rooms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700">Nenhum item planejado encontrado.</p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Planejar primeira compra
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map((item) => {
            const m = computePlannedPurchaseMetrics(item);
            return (
              <div key={item.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${item.priority >= 8 ? 'text-red-600' : 'text-slate-600'}`}>
                      P{item.priority}
                    </span>
                    <span className="text-slate-300">·</span>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.product} {item.quantity > 1 ? `(${item.quantity}x)` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.room}
                    {item.brandModel ? ` · ${item.brandModel}` : ''}
                    {item.specs ? ` · ${item.specs}` : ''}
                    {item.targetDate ? ` · Prazo: ${formatDateBR(item.targetDate)}` : ''}
                    {' · '}
                    <span
                      className={
                        item.status === 'Comprado'
                          ? 'text-emerald-700 font-medium'
                          : item.status === 'Pesquisando'
                          ? 'text-sky-700 font-medium'
                          : 'text-slate-600 font-medium'
                      }
                    >
                      {item.status}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-5 min-w-0 sm:shrink-0">
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-slate-500">
                      Previsto: <strong className="font-mono tabular-nums text-slate-900">{formatBRL(m.totalEstimated)}</strong>
                    </p>
                    {m.totalPaid !== null ? (
                      <p className="text-xs">
                        Pago: <strong className="font-mono tabular-nums text-slate-900">{formatBRL(m.totalPaid)}</strong>{' '}
                        <span
                          className={
                            m.comparison === 'Abaixo do planejado'
                              ? 'text-emerald-700 font-medium'
                              : m.comparison === 'Acima do planejado'
                              ? 'text-red-600 font-medium'
                              : 'text-amber-700 font-medium'
                          }
                        >
                          ({m.comparison})
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Aguardando compra</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlannedPurchase(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="duofin-dialog-enter bg-white w-full sm:max-w-lg rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar item planejado' : 'Novo item planejado'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Produto / item</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="Ex.: Sofá retrátil, Geladeira"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prioridade (0–10)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ambiente</label>
                  <select
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {household.rooms.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value as PlannedPurchaseStatus;
                      setStatus(next);
                      if (next === 'Comprado') setHasActualPrice(true);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Pesquisando">Pesquisando</option>
                    <option value="Comprado">Comprado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor estimado unit.</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={estimatedUnitPrice}
                    onChange={(e) => setEstimatedUnitPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prazo desejado</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Marca / modelo</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={brandModel}
                    onChange={(e) => setBrandModel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Especificações</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={specs}
                    onChange={(e) => setSpecs(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasActualPrice}
                    onChange={(e) => setHasActualPrice(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Informar preço real pago
                </label>
                {hasActualPrice && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Valor pago unit.</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={actualUnitPrice}
                        onChange={(e) => setActualUnitPrice(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Data da compra</label>
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Pagamento</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                      >
                        {household.paymentMethods.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
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
