import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bike,
  Building2,
  Camera,
  Car,
  CheckCircle2,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  Package,
  Pencil,
  Plane,
  Plus,
  Refrigerator,
  Search,
  ShoppingBag,
  Smartphone,
  Sofa,
  Trash2,
  X,
} from 'lucide-react';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import type { PlannedPurchase, PlannedPurchaseKind, PlannedPurchaseStatus } from '../types/finance';
import {
  computePlannedPurchaseMetrics,
  computeProjectsPortfolioSummary,
  formatBRL,
  formatDateBR,
  formatMonthShort,
} from '../utils/financeCalculations';
import { resolvePlannedPurchaseKind } from '../utils/validation';

interface ProjectTemplate {
  id: string;
  label: string;
  defaultRoom: string;
  iconName: string;
  defaultKind: PlannedPurchaseKind;
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'casa', label: 'Casa', defaultRoom: 'Casa', iconName: 'Home', defaultKind: 'projeto' },
  { id: 'apartamento', label: 'Apartamento', defaultRoom: 'Apartamento', iconName: 'Building2', defaultKind: 'projeto' },
  { id: 'carro', label: 'Carro', defaultRoom: 'Veículo', iconName: 'Car', defaultKind: 'projeto' },
  { id: 'moto', label: 'Moto', defaultRoom: 'Veículo', iconName: 'Bike', defaultKind: 'projeto' },
  { id: 'celular', label: 'Celular', defaultRoom: 'Eletrônicos', iconName: 'Smartphone', defaultKind: 'compra' },
  { id: 'computador', label: 'Computador', defaultRoom: 'Eletrônicos', iconName: 'Laptop', defaultKind: 'compra' },
  { id: 'videogame', label: 'Videogame', defaultRoom: 'Lazer', iconName: 'Gamepad2', defaultKind: 'compra' },
  { id: 'viagem', label: 'Viagem', defaultRoom: 'Viagem', iconName: 'Plane', defaultKind: 'projeto' },
  { id: 'moveis', label: 'Móveis', defaultRoom: 'Sala', iconName: 'Sofa', defaultKind: 'compra' },
  { id: 'eletro', label: 'Eletrodomésticos', defaultRoom: 'Cozinha', iconName: 'Refrigerator', defaultKind: 'compra' },
  { id: 'outros', label: 'Outro projeto', defaultRoom: 'Outros', iconName: 'Package', defaultKind: 'projeto' },
];

const PROJECT_ICONS: Array<{ name: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { name: 'Home', label: 'Casa', Icon: Home },
  { name: 'Building2', label: 'Apartamento', Icon: Building2 },
  { name: 'Car', label: 'Carro', Icon: Car },
  { name: 'Bike', label: 'Moto', Icon: Bike },
  { name: 'Smartphone', label: 'Celular', Icon: Smartphone },
  { name: 'Laptop', label: 'Computador', Icon: Laptop },
  { name: 'Gamepad2', label: 'Videogame', Icon: Gamepad2 },
  { name: 'Plane', label: 'Viagem', Icon: Plane },
  { name: 'Sofa', label: 'Móveis', Icon: Sofa },
  { name: 'Refrigerator', label: 'Eletro', Icon: Refrigerator },
  { name: 'GraduationCap', label: 'Estudos', Icon: GraduationCap },
  { name: 'HeartPulse', label: 'Saúde', Icon: HeartPulse },
  { name: 'Camera', label: 'Câmera', Icon: Camera },
  { name: 'Package', label: 'Projeto', Icon: Package },
];

function resolveProjectIcon(iconName?: string, category?: string): React.ComponentType<{ className?: string }> {
  const byName = PROJECT_ICONS.find((entry) => entry.name === iconName);
  if (byName) return byName.Icon;
  const lower = (category || '').toLowerCase();
  if (lower.includes('casa')) return Home;
  if (lower.includes('apart')) return Building2;
  if (lower.includes('carro')) return Car;
  if (lower.includes('moto')) return Bike;
  if (lower.includes('celul') || lower.includes('phone')) return Smartphone;
  if (lower.includes('comput') || lower.includes('note') || lower.includes('pc')) return Laptop;
  if (lower.includes('game') || lower.includes('console')) return Gamepad2;
  if (lower.includes('viag')) return Plane;
  if (lower.includes('móve') || lower.includes('move')) return Sofa;
  if (lower.includes('eletro') || lower.includes('cozin')) return Refrigerator;
  return Package;
}

export function PlannedPurchasesPage({ embedded = false }: { embedded?: boolean }) {
  const { household, plannedPurchases, goals, bankAccounts, savePlannedPurchase, deletePlannedPurchase } = useFinance();

  const [searchText, setSearchText] = useState('');
  const [selectedKind, setSelectedKind] = useState<PlannedPurchaseKind | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterRoom, setFilterRoom] = useState<string>('ALL');

  // Simulador inline por card (ritmo mensal)
  const [paceOverrides, setPaceOverrides] = useState<Record<string, number>>({});
  const [savingPaceId, setSavingPaceId] = useState<string | null>(null);

  // Modal Projeto / Compra
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedPurchase | null>(null);

  const [itemKind, setItemKind] = useState<PlannedPurchaseKind>('compra');
  const [priority, setPriority] = useState('8');
  const [projectCategory, setProjectCategory] = useState('Casa');
  const [iconName, setIconName] = useState('Home');
  const [room, setRoom] = useState('Casa');
  const [product, setProduct] = useState('');
  const [brandModel, setBrandModel] = useState('');
  const [specs, setSpecs] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [estimatedUnitPrice, setEstimatedUnitPrice] = useState('');
  const [savedAmount, setSavedAmount] = useState('0');
  const [monthlyContribution, setMonthlyContribution] = useState('0');
  const [linkedGoalId, setLinkedGoalId] = useState('');
  const [hasActualPrice, setHasActualPrice] = useState(false);
  const [actualUnitPrice, setActualUnitPrice] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [status, setStatus] = useState<PlannedPurchaseStatus>('Pendente');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const kindItems = useMemo(() => {
    if (!selectedKind) return [];
    return plannedPurchases.filter((item) => resolvePlannedPurchaseKind(item) === selectedKind);
  }, [plannedPurchases, selectedKind]);

  const sectionPortfolio = useMemo(
    () =>
      computeProjectsPortfolioSummary({
        plannedPurchases: kindItems,
        goals,
        bankAccounts,
      }),
    [kindItems, goals, bankAccounts]
  );

  const categoryOptions = useMemo(() => {
    const base = new Set<string>([
      ...(household?.rooms ?? []),
      ...PROJECT_TEMPLATES.map((t) => t.defaultRoom),
      ...plannedPurchases.map((p) => p.room).filter(Boolean),
    ]);
    return Array.from(base);
  }, [household?.rooms, plannedPurchases]);

  const kindSummary = useMemo(() => {
    const purchases = plannedPurchases.filter((p) => resolvePlannedPurchaseKind(p) === 'compra');
    const projects = plannedPurchases.filter((p) => resolvePlannedPurchaseKind(p) === 'projeto');
    const sumActive = (list: PlannedPurchase[]) =>
      list
        .filter((i) => i.status !== 'Cancelado')
        .reduce((s, i) => s + (i.hasActualPrice ? i.actualUnitPrice : i.estimatedUnitPrice) * i.quantity, 0);
    return {
      purchaseCount: purchases.length,
      purchaseTotal: sumActive(purchases),
      projectCount: projects.length,
      projectTotal: sumActive(projects),
    };
  }, [plannedPurchases]);

  const filtered = useMemo(() => {
    if (!selectedKind) return [];
    const q = searchText.trim().toLowerCase();
    return kindItems
      .filter((item) => {
        if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
        if (filterRoom !== 'ALL' && item.room !== filterRoom && item.projectCategory !== filterRoom) return false;
        if (q) {
          const hay = `${item.product} ${item.brandModel} ${item.specs} ${item.room} ${item.projectCategory ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.priority - a.priority);
  }, [selectedKind, kindItems, filterStatus, filterRoom, searchText]);

  const modalPreview = useMemo(() => {
    const qVal = Math.max(1, Number(quantity) || 1);
    const estVal = Math.max(0, Number(estimatedUnitPrice.replace(',', '.')) || 0);
    const linkedGoal = linkedGoalId ? goalsById.get(linkedGoalId) : undefined;
    const savedVal = linkedGoal ? linkedGoal.currentAmount : Math.max(0, Number(savedAmount.replace(',', '.')) || 0);
    const monthlyVal = Math.max(0, Number(monthlyContribution.replace(',', '.')) || 0);
    return computePlannedPurchaseMetrics(
      {
        id: 'preview',
        priority: Number(priority) || 8,
        room,
        projectCategory,
        iconName,
        product: product || 'Projeto',
        brandModel,
        specs,
        quantity: qVal,
        estimatedUnitPrice: estVal,
        actualUnitPrice: 0,
        hasActualPrice: false,
        savedAmount: savedVal,
        monthlyContribution: monthlyVal,
        linkedGoalId: linkedGoalId || undefined,
        targetDate,
        purchaseDate: '',
        paymentMethod,
        status,
        notes,
        createdByUid: '',
        createdByName: '',
        updatedByUid: '',
        updatedByName: '',
      },
      { linkedGoal, overrideMonthlyContribution: monthlyVal }
    );
  }, [
    quantity,
    estimatedUnitPrice,
    linkedGoalId,
    goalsById,
    savedAmount,
    monthlyContribution,
    priority,
    room,
    projectCategory,
    iconName,
    product,
    brandModel,
    specs,
    targetDate,
    paymentMethod,
    status,
    notes,
  ]);

  const applyTemplate = (tpl: ProjectTemplate) => {
    setItemKind(tpl.defaultKind);
    setProjectCategory(tpl.label);
    setIconName(tpl.iconName);
    setRoom(tpl.defaultRoom);
  };

  const selectKind = (kind: PlannedPurchaseKind | null) => {
    setSelectedKind(kind);
    setSearchText('');
    setFilterStatus('ALL');
    setFilterRoom('ALL');
  };

  const openNew = () => {
    setEditing(null);
    const defaultKind: PlannedPurchaseKind = selectedKind === 'projeto' ? 'projeto' : 'compra';
    setItemKind(defaultKind);
    setPriority('8');
    setProjectCategory(defaultKind === 'compra' ? 'Celular' : 'Casa');
    setIconName(defaultKind === 'compra' ? 'Smartphone' : 'Home');
    setRoom(household?.rooms[0] ?? (defaultKind === 'compra' ? 'Eletrônicos' : 'Casa'));
    setProduct('');
    setBrandModel('');
    setSpecs('');
    setQuantity('1');
    setEstimatedUnitPrice('');
    setSavedAmount('0');
    setMonthlyContribution('0');
    setLinkedGoalId('');
    setHasActualPrice(false);
    setActualUnitPrice('');
    setTargetDate('');
    setPurchaseDate('');
    setPaymentMethod(household?.paymentMethods[0] ?? 'Pix');
    setStatus('Pendente');
    setNotes('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item: PlannedPurchase) => {
    setEditing(item);
    setItemKind(resolvePlannedPurchaseKind(item));
    setPriority(String(item.priority));
    setProjectCategory(item.projectCategory ?? item.room ?? 'Outros');
    setIconName(item.iconName ?? 'Package');
    setRoom(item.room);
    setProduct(item.product);
    setBrandModel(item.brandModel);
    setSpecs(item.specs);
    setQuantity(String(item.quantity));
    setEstimatedUnitPrice(String(item.estimatedUnitPrice));
    setSavedAmount(String(item.savedAmount ?? 0));
    setMonthlyContribution(String(item.monthlyContribution ?? 0));
    setLinkedGoalId(item.linkedGoalId ?? '');
    setHasActualPrice(item.hasActualPrice);
    setActualUnitPrice(item.hasActualPrice ? String(item.actualUnitPrice) : '');
    setTargetDate(item.targetDate);
    setPurchaseDate(item.purchaseDate);
    setPaymentMethod(item.paymentMethod || 'Pix');
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
          itemKind,
          priority: Number(priority) || 5,
          room: room || projectCategory || 'Outros',
          projectCategory,
          iconName,
          product,
          brandModel,
          specs,
          quantity: Number(quantity) || 1,
          estimatedUnitPrice: Number(estimatedUnitPrice.replace(',', '.')) || 0,
          actualUnitPrice: hasActualPrice ? Number(actualUnitPrice.replace(',', '.')) || 0 : 0,
          hasActualPrice,
          savedAmount: linkedGoalId ? (goalsById.get(linkedGoalId)?.currentAmount ?? 0) : Math.max(0, Number(savedAmount.replace(',', '.')) || 0),
          monthlyContribution: Math.max(0, Number(monthlyContribution.replace(',', '.')) || 0),
          linkedGoalId: linkedGoalId || '',
          targetDate,
          purchaseDate: status === 'Comprado' ? purchaseDate : '',
          paymentMethod,
          status,
          notes,
        },
        editing?.id
      );
      setModalOpen(false);
      setSelectedKind(itemKind);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar projeto.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyInlinePace = async (item: PlannedPurchase, nextMonthly: number) => {
    setSavingPaceId(item.id);
    try {
      await savePlannedPurchase(
        {
          itemKind: resolvePlannedPurchaseKind(item),
          priority: item.priority,
          room: item.room,
          projectCategory: item.projectCategory ?? item.room,
          iconName: item.iconName,
          product: item.product,
          brandModel: item.brandModel,
          specs: item.specs,
          quantity: item.quantity,
          estimatedUnitPrice: item.estimatedUnitPrice,
          actualUnitPrice: item.actualUnitPrice,
          hasActualPrice: item.hasActualPrice,
          savedAmount: item.savedAmount ?? 0,
          monthlyContribution: Math.max(0, nextMonthly),
          linkedGoalId: item.linkedGoalId ?? '',
          targetDate: item.targetDate,
          purchaseDate: item.purchaseDate,
          paymentMethod: item.paymentMethod,
          status: item.status,
          notes: item.notes,
        },
        item.id
      );
      setPaceOverrides((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    } finally {
      setSavingPaceId(null);
    }
  };

  if (!household) return null;

  return (
    <div className="space-y-6">
      {selectedKind === null ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              {embedded ? (
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Futuras Compras e Projetos
                </h2>
              ) : (
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Futuras Compras e Projetos
                </h1>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Escolha uma opção abaixo para visualizar e gerenciar suas compras ou seus projetos.
              </p>
            </div>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Novo projeto / compra
            </button>
          </div>

          {/* Dois grandes ícones de acesso: Compras (sacola) e Projetos (prancheta) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label="Separador Compras e Projetos">
            <button
              type="button"
              onClick={() => selectKind('compra')}
              className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md p-6 transition-all cursor-pointer flex items-center gap-5"
            >
              <div className="w-20 h-20 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-10 h-10" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Compras
                  </h2>
                  <span className="text-xs font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {kindSummary.purchaseCount} {kindSummary.purchaseCount === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tudo registrado como compra de produtos, itens e equipamentos.
                </p>
                <p className="text-xs font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300 mt-2">
                  Total planejado: {formatBRL(kindSummary.purchaseTotal)}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectKind('projeto')}
              className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-400 dark:hover:border-sky-600 hover:shadow-md p-6 transition-all cursor-pointer flex items-center gap-5"
            >
              <div className="w-20 h-20 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                <ClipboardList className="w-10 h-10" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Projetos
                  </h2>
                  <span className="text-xs font-mono font-bold tabular-nums text-sky-700 dark:text-sky-400">
                    {kindSummary.projectCount} {kindSummary.projectCount === 1 ? 'projeto' : 'projetos'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Projetos em geral, reformas, metas patrimoniais, veículos e viagens.
                </p>
                <p className="text-xs font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300 mt-2">
                  Total planejado: {formatBRL(kindSummary.projectTotal)}
                </p>
              </div>
            </button>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => selectKind(null)}
                aria-label="Voltar para Compras e Projetos"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedKind === 'compra'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                    : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400'
                }`}
              >
                {selectedKind === 'compra' ? (
                  <ShoppingBag className="w-5 h-5" />
                ) : (
                  <ClipboardList className="w-5 h-5" />
                )}
              </div>
              <div>
                {embedded ? (
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {selectedKind === 'compra' ? 'Compras' : 'Projetos'}
                  </h2>
                ) : (
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {selectedKind === 'compra' ? 'Compras' : 'Projetos'}
                  </h1>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedKind === 'compra'
                    ? 'Itens, equipamentos e produtos registrados como compras.'
                    : 'Projetos em geral, metas patrimoniais, veículos, reformas e viagens.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => selectKind(selectedKind === 'compra' ? 'projeto' : 'compra')}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                {selectedKind === 'compra' ? (
                  <>
                    <ClipboardList className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    Abrir Projetos ({kindSummary.projectCount})
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Abrir Compras ({kindSummary.purchaseCount})
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {selectedKind === 'compra' ? 'Nova compra' : 'Novo projeto'}
              </button>
            </div>
          </div>

          {/* KPIs da seção aberta */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-300">
                {selectedKind === 'compra' ? 'Orçamento das compras ativas' : 'Orçamento dos projetos ativos'}
              </span>
              <p className="text-2xl font-bold font-mono tabular-nums text-white">
                {formatBRL(sectionPortfolio.totalProjectsBudget)}
              </p>
              <p className="text-[11px] text-slate-300">
                {sectionPortfolio.activeProjectsCount} ativo(s) · {sectionPortfolio.completedProjectsCount} concluído(s)
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Já reservado / falta guardar</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatBRL(sectionPortfolio.totalSavedForProjects)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Falta guardar: {formatBRL(sectionPortfolio.totalRemainingForProjects)}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Comprometimento do patrimônio</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {sectionPortfolio.committedPatrimonyPct.toFixed(1).replace('.', ',')}%
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Patrimônio base: {formatBRL(sectionPortfolio.totalPatrimony)}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {selectedKind === 'compra' ? 'Aporte mensal em compras' : 'Aporte mensal em projetos'}
              </span>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatBRL(sectionPortfolio.totalMonthlyContributions)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Soma dos planos mensais ativos</p>
            </div>
          </section>

          {/* Filtros e Busca */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={
                  selectedKind === 'compra'
                    ? 'Buscar compra, modelo ou categoria...'
                    : 'Buscar projeto, modelo ou categoria...'
                }
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <select
              aria-label="Filtrar por status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="ALL">Todos os status</option>
              <option value="Pendente">Pendente</option>
              <option value="Pesquisando">Pesquisando</option>
              <option value="Comprado">Comprado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
            <select
              aria-label="Filtrar por categoria"
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="ALL">Todas as categorias</option>
              {categoryOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Cards da seção selecionada */}
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              {selectedKind === 'compra' ? (
                <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
              ) : (
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
              )}
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {selectedKind === 'compra'
                  ? 'Nenhuma compra registrada.'
                  : 'Nenhum projeto encontrado.'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedKind === 'compra'
                  ? 'Cadastre itens como Celular, Computador, Móveis ou Eletrodomésticos para acompanhar o valor reservado.'
                  : 'Cadastre objetivos como Casa, Carro, Moto ou Viagem para acompanhar o progresso até a realização.'}
              </p>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {selectedKind === 'compra' ? 'Cadastrar compra' : 'Criar projeto'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const linkedGoal = item.linkedGoalId ? goalsById.get(item.linkedGoalId) : undefined;
            const overrideMonthly = paceOverrides[item.id];
            const m = computePlannedPurchaseMetrics(item, {
              linkedGoal,
              overrideMonthlyContribution: overrideMonthly,
            });
            const Icon = resolveProjectIcon(item.iconName, item.projectCategory ?? item.room);
            const hasOverride =
              overrideMonthly !== undefined && Math.abs(overrideMonthly - (item.monthlyContribution ?? 0)) > 0.01;
            const maxSlider = Math.max(500, Math.ceil(m.effectiveTargetTotal / 2));

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                {/* Cabeçalho do Projeto */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.product} {item.quantity > 1 ? `(${item.quantity}x)` : ''}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {resolvePlannedPurchaseKind(item) === 'compra' ? 'Compra' : 'Projeto'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.projectCategory || item.room}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-mono font-semibold ${item.priority >= 8 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          P{item.priority}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            item.status === 'Comprado'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : item.status === 'Pesquisando'
                                ? 'text-sky-700 dark:text-sky-400 font-semibold'
                                : 'text-slate-700 dark:text-slate-300 font-medium'
                          }
                        >
                          {item.status}
                        </span>
                        {item.brandModel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.brandModel}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      aria-label={`Editar ${item.product}`}
                      className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlannedPurchase(item.id)}
                      aria-label={`Excluir ${item.product}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progresso Financeiro */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      Guardado{' '}
                      <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatBRL(m.effectiveSavedAmount)}
                      </strong>{' '}
                      de{' '}
                      <span className="font-mono tabular-nums">{formatBRL(m.effectiveTargetTotal)}</span>
                    </span>
                    <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {m.completionPct.toFixed(1).replace('.', ',')}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${Math.min(100, m.completionPct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">Falta: {formatBRL(m.remainingAmount)}</span>
                    {linkedGoal && <span>Vinculado à caixinha: {linkedGoal.name}</span>}
                  </div>
                </div>

                {/* Grade de Prazo & Previsão */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Prazo desejado</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {item.targetDate ? formatDateBR(item.targetDate) : 'Sem prazo'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Para bater o prazo</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {m.recommendedMonthlyContribution !== null
                        ? `${formatBRL(m.recommendedMonthlyContribution)}/mês`
                        : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 dark:text-slate-400">Previsão atual</p>
                    <p
                      className={`font-semibold mt-0.5 ${
                        m.isOnTrackForDeadline === false
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {item.status === 'Comprado'
                        ? 'Comprado'
                        : m.projectedMonthsAtPlannedPace === 0
                          ? 'Valor completo'
                          : m.projectedCompletionMonthKey
                            ? `${formatMonthShort(m.projectedCompletionMonthKey)} (${m.projectedMonthsAtPlannedPace}m)`
                            : 'Defina aporte'}
                    </p>
                  </div>
                </div>

                {/* Simulador Inline de Ritmo Mensal (apenas projetos ativos) */}
                {item.status !== 'Comprado' && item.status !== 'Cancelado' && m.remainingAmount > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Simular ritmo mensal:
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatBRL(m.plannedMonthlyContribution)}/mês
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max={maxSlider}
                        step="50"
                        aria-label={`Simular aporte mensal de ${item.product}`}
                        value={Math.min(maxSlider, m.plannedMonthlyContribution)}
                        onChange={(e) =>
                          setPaceOverrides((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                        }
                        className="flex-1 accent-slate-900 dark:accent-emerald-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={m.plannedMonthlyContribution}
                        onChange={(e) =>
                          setPaceOverrides((prev) => ({
                            ...prev,
                            [item.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-24 px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg text-right"
                      />
                    </div>
                    {hasOverride && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.projectedCompletionMonthKey
                            ? `Com esse ritmo, conclusão em ${formatMonthShort(m.projectedCompletionMonthKey)} (${m.projectedMonthsAtPlannedPace}m).`
                            : 'Informe um aporte positivo para calcular a data.'}
                        </span>
                        <button
                          type="button"
                          disabled={savingPaceId === item.id}
                          onClick={() => handleApplyInlinePace(item, m.plannedMonthlyContribution)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {savingPaceId === item.id ? 'Salvando...' : 'Aplicar ao projeto'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {m.totalPaid !== null && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                    Pago: <strong className="font-mono tabular-nums">{formatBRL(m.totalPaid)}</strong>{' '}
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
                )}
              </div>
            );
          })}
        </div>
          )}
        </>
      )}

      {/* Modal Projeto / Futura Compra */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editing ? 'Editar projeto / futura compra' : 'Novo projeto ou futura compra'}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
                )}

                {/* Tipo de registro: Compra (Sacola) vs Projeto (Prancheta) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tipo de registro
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setItemKind('compra')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        itemKind === 'compra'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Compra (Sacola)
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemKind('projeto')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        itemKind === 'projeto'
                          ? 'bg-slate-900 dark:bg-sky-700 text-white border-slate-900 dark:border-sky-700'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ClipboardList className="w-4 h-4" />
                      Projeto (Prancheta)
                    </button>
                  </div>
                </div>

                {/* Modelos rápidos de projeto */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Categoria rápida do projeto
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PROJECT_TEMPLATES.map((tpl) => {
                      const active = projectCategory === tpl.label;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                            active
                              ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {tpl.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Seletor visual de ícone */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Ícone do projeto
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {PROJECT_ICONS.map(({ name, label, Icon }) => {
                      const active = iconName === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          title={label}
                          aria-label={`Ícone ${label}`}
                          onClick={() => setIconName(name)}
                          className={`h-10 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                            active
                              ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome do projeto / produto
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      placeholder="Ex.: Entrada do apartamento, MacBook, Carro"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Prioridade (0–10)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Categoria / grupo
                    </label>
                    <select
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {categoryOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => {
                        const next = e.target.value as PlannedPurchaseStatus;
                        setStatus(next);
                        if (next === 'Comprado') setHasActualPrice(true);
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
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
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Valor estimado unit. (R$)
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={estimatedUnitPrice}
                      onChange={(e) => setEstimatedUnitPrice(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Prazo desejado
                    </label>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                {/* Planejamento de reserva e vínculo opcional com Caixinha */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vincular caixinha (opcional)
                    </label>
                    <select
                      value={linkedGoalId}
                      onChange={(e) => setLinkedGoalId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      <option value="">Sem vínculo (valor próprio)</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({formatBRL(g.currentAmount)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Já guardado (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={Boolean(linkedGoalId)}
                      value={linkedGoalId ? String(goalsById.get(linkedGoalId)?.currentAmount ?? 0) : savedAmount}
                      onChange={(e) => setSavedAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Aporte mensal (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                {modalPreview.effectiveTargetTotal > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono tabular-nums">
                      Falta guardar: <strong>{formatBRL(modalPreview.remainingAmount)}</strong>
                    </span>
                    <span className="font-mono tabular-nums">
                      {modalPreview.recommendedMonthlyContribution !== null && modalPreview.remainingAmount > 0
                        ? `Ideal para o prazo: ${formatBRL(modalPreview.recommendedMonthlyContribution)}/mês`
                        : modalPreview.projectedCompletionMonthKey
                          ? `Previsão: ${formatMonthShort(modalPreview.projectedCompletionMonthKey)} (${modalPreview.projectedMonthsAtPlannedPace}m)`
                          : 'Defina prazo ou aporte mensal'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Marca / modelo / detalhe
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={brandModel}
                      onChange={(e) => setBrandModel(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Especificações / observação
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={specs}
                      onChange={(e) => setSpecs(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
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
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Valor pago unit.
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={actualUnitPrice}
                          onChange={(e) => setActualUnitPrice(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Data da compra
                        </label>
                        <input
                          type="date"
                          value={purchaseDate}
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Pagamento
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
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

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    {saving ? 'Salvando...' : 'Salvar projeto'}
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
