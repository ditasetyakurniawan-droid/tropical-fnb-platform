import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Award,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Search,
  Plus,
  X,
  Thermometer,
  ShieldAlert,
  Flame,
  ChefHat,
  Sparkles,
  Trash2,
  Edit3,
  Settings,
  Layers,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { Button } from '@/shared/ui/Button';
import { NumberInput } from '@/shared/ui/NumberInput';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import { cn } from '@/shared/lib/cn';
import type {
  SOPChecklistRun,
  StationType,
  ShiftPhaseType,
  CreateChecklistRunPayload,
  CreateQualityAuditPayload,
  CreateSOPTemplatePayload,
  CreateSOPTemplateItemPayload,
  SOPHandbookArticle,
} from './types';
import {
  fetchSOPTemplates,
  createSOPTemplate,
  deleteSOPTemplate,
  fetchSOPChecklistRuns,
  fetchSOPChecklistRunDetail,
  createSOPChecklistRun,
  updateSOPChecklistItem,
  completeSOPChecklistRun,
  fetchQualityAudits,
  createQualityAudit,
  updateAuditActionItemStatus,
  fetchHandbookArticles,
  createHandbookArticle,
  updateHandbookArticle,
  deleteHandbookArticle,
} from './sop-api';

type TabType = 'checklists' | 'audits' | 'handbook';

export const SOPQualityPage: React.FC = () => {
  const { activeOutletId, accessibleOutlets } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('checklists');

  // Filters for Tab 1
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [selectedPhase, setSelectedPhase] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filters for Tab 3 (Handbook)
  const [selectedHandbookCategory, setSelectedHandbookCategory] = useState<string>('ALL');

  // Modals
  const [activeRunModal, setActiveRunModal] = useState<SOPChecklistRun | null>(null);
  const [isNewRunModalOpen, setIsNewRunModalOpen] = useState(false);
  const [isNewAuditModalOpen, setIsNewAuditModalOpen] = useState(false);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(null);

  // Custom Template Manager & Builder Modal
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [templateViewMode, setTemplateViewMode] = useState<'list' | 'create'>('create');
  const [tmplCode, setTmplCode] = useState('SOP-CUSTOM-01');
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplStation, setTmplStation] = useState<StationType>('GRILL_STEAK');
  const [tmplPhase, setTmplPhase] = useState<ShiftPhaseType>('OPENING');
  const [tmplDuration, setTmplDuration] = useState<number>(20);
  const [tmplDescription, setTmplDescription] = useState('');
  const [tmplItems, setTmplItems] = useState<CreateSOPTemplateItemPayload[]>([
    {
      task_name: 'Pemeriksaan kebersihan permukaan alat & stasiun',
      task_instruction: 'Pastikan bebas residu minyak dan debu sebelum beroperasi.',
      requires_photo: false,
      requires_numeric_input: false,
      numeric_unit: '',
      min_val: null,
      max_val: null,
      is_critical: false,
    },
  ]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Digital Handbook Article Modal
  const [isHandbookModalOpen, setIsHandbookModalOpen] = useState(false);
  const [editingHandbookArticle, setEditingHandbookArticle] = useState<SOPHandbookArticle | null>(null);
  const [hbCategory, setHbCategory] = useState('STEAK_GRILL');
  const [hbTitle, setHbTitle] = useState('');
  const [hbSubtitle, setHbSubtitle] = useState('');
  const [hbBadge, setHbBadge] = useState('STANDAR RESEP');
  const [hbContent, setHbContent] = useState('');
  const [isSavingHandbook, setIsSavingHandbook] = useState(false);
  const [confirmDeleteHandbookId, setConfirmDeleteHandbookId] = useState<string | null>(null);
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<string | null>(null);

  // New run form
  const [newRunTemplateId, setNewRunTemplateId] = useState('');
  const [newRunShiftName, setNewRunShiftName] = useState('SHIFT_PAGI');
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  // New audit form
  const [auditFoodScore, setAuditFoodScore] = useState(95);
  const [auditSpeedScore, setAuditSpeedScore] = useState(90);
  const [auditCleanScore, setAuditCleanScore] = useState(95);
  const [auditSafetyScore, setAuditSafetyScore] = useState(96);
  const [auditNotes, setAuditNotes] = useState('');
  const [isCreatingAudit, setIsCreatingAudit] = useState(false);

  // Queries
  const {
    data: templates = [],
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['sop-templates', activeOutletId],
    queryFn: () => fetchSOPTemplates(activeOutletId || undefined),
  });

  const {
    data: runs = [],
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ['sop-checklist-runs', activeOutletId],
    queryFn: () => fetchSOPChecklistRuns(activeOutletId || undefined),
  });

  const {
    data: audits = [],
    refetch: refetchAudits,
  } = useQuery({
    queryKey: ['sop-quality-audits', activeOutletId],
    queryFn: () => fetchQualityAudits(activeOutletId || undefined),
  });

  const {
    data: handbookArticles = [],
    refetch: refetchHandbook,
  } = useQuery({
    queryKey: ['sop-handbook-articles', selectedHandbookCategory],
    queryFn: () => fetchHandbookArticles(selectedHandbookCategory),
  });

  // Defensive fallbacks for query results
  const safeTemplates = useMemo(() => (Array.isArray(templates) ? templates : []), [templates]);
  const safeRuns = useMemo(() => (Array.isArray(runs) ? runs : []), [runs]);
  const safeAudits = useMemo(() => (Array.isArray(audits) ? audits : []), [audits]);
  const safeHandbook = useMemo(() => (Array.isArray(handbookArticles) ? handbookArticles : []), [handbookArticles]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return safeRuns.filter((r) => {
      const matchStation = selectedStation === 'ALL' || r.station === selectedStation;
      const matchPhase = selectedPhase === 'ALL' || r.shift_phase === selectedPhase;
      const matchSearch =
        searchQuery === '' ||
        (r.template_title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.template_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.assigned_to_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchStation && matchPhase && matchSearch;
    });
  }, [safeRuns, selectedStation, selectedPhase, searchQuery]);

  // KPI Metrics
  const stats = useMemo(() => {
    const total = safeRuns.length;
    const completed = safeRuns.filter((r) => r.status === 'COMPLETED').length;
    const inProgress = safeRuns.filter((r) => r.status === 'IN_PROGRESS').length;
    const flagged = safeRuns.filter((r) => r.status === 'FLAGGED_ISSUE' || r.flagged_items > 0).length;
    return { total, completed, inProgress, flagged };
  }, [safeRuns]);

  // Latest Audit
  const latestAudit = safeAudits.length > 0 ? safeAudits[0] : null;

  // Actions
  const handleToggleItem = async (run: SOPChecklistRun, recordId: string, currentVal: boolean, numericVal?: number) => {
    try {
      const updated = await updateSOPChecklistItem(run.id, recordId, {
        is_checked: !currentVal,
        numeric_actual_value: numericVal,
      });

      if (activeRunModal && activeRunModal.id === run.id && activeRunModal.records) {
        const updatedRecords = activeRunModal.records.map((rec) =>
          rec.id === recordId ? { ...rec, ...updated } : rec
        );
        const compCount = updatedRecords.filter((r) => r.is_checked).length;
        const flagCount = updatedRecords.filter((r) => r.flagged).length;
        setActiveRunModal({
          ...activeRunModal,
          records: updatedRecords,
          completed_items: compCount,
          flagged_items: flagCount,
        });
      }
      refetchRuns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui item checklist');
    }
  };

  const handleNumericChange = async (run: SOPChecklistRun, recordId: string, val: number, isChecked: boolean) => {
    try {
      const updated = await updateSOPChecklistItem(run.id, recordId, {
        is_checked: isChecked,
        numeric_actual_value: val,
      });

      if (activeRunModal && activeRunModal.id === run.id && activeRunModal.records) {
        const updatedRecords = activeRunModal.records.map((rec) =>
          rec.id === recordId ? { ...rec, ...updated } : rec
        );
        setActiveRunModal({
          ...activeRunModal,
          records: updatedRecords,
        });
      }
      refetchRuns();
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleCompleteRun = async (runId: string) => {
    try {
      await completeSOPChecklistRun(runId, {
        supervisor_notes: 'Selesai ditinjau dan diverifikasi sesuai SOP resto.',
      });
      setActiveRunModal(null);
      refetchRuns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyelesaikan sesi checklist');
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunTemplateId) {
      alert('Pilih template SOP terlebih dahulu!');
      return;
    }
    setIsCreatingRun(true);
    let outletId = activeOutletId;
    if (!outletId || outletId === 'ALL') {
      outletId = accessibleOutlets[0]?.id || '';
    }

    const payload: CreateChecklistRunPayload = {
      outlet_id: outletId,
      template_id: newRunTemplateId,
      shift_name: newRunShiftName,
    };

    try {
      const run = await createSOPChecklistRun(payload);
      setIsNewRunModalOpen(false);
      refetchRuns();
      setActiveRunModal(run);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memulai sesi checklist');
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingAudit(true);
    let outletId = activeOutletId;
    if (!outletId || outletId === 'ALL') {
      outletId = accessibleOutlets[0]?.id || '';
    }

    const payload: CreateQualityAuditPayload = {
      outlet_id: outletId,
      audit_type: 'ROUTINE_WEEKLY',
      score_food_quality: auditFoodScore,
      score_service_speed: auditSpeedScore,
      score_cleanliness: auditCleanScore,
      score_safety_equipment: auditSafetyScore,
      summary_notes: auditNotes || 'Audit mutu berkala operasional Tropical Resto.',
    };

    try {
      await createQualityAudit(payload);
      setIsNewAuditModalOpen(false);
      refetchAudits();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal membuat audit mutu');
    } finally {
      setIsCreatingAudit(false);
    }
  };

  const handleResolveActionItem = async (actionId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
    try {
      await updateAuditActionItemStatus(actionId, {
        status: nextStatus,
        resolution_notes: nextStatus === 'RESOLVED' ? 'Tindakan perbaikan telah selesai dilaksanakan dan diverifikasi SPV.' : '',
      });
      refetchAudits();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status temuan audit');
    }
  };

  // Custom Template Handlers
  const handleAddTemplateItem = () => {
    setTmplItems([
      ...tmplItems,
      {
        task_name: '',
        task_instruction: '',
        requires_photo: false,
        requires_numeric_input: false,
        numeric_unit: '',
        min_val: null,
        max_val: null,
        is_critical: false,
      },
    ]);
  };

  const handleRemoveTemplateItem = (index: number) => {
    if (tmplItems.length <= 1) return;
    setTmplItems(tmplItems.filter((_, idx) => idx !== index));
  };

  const handleUpdateTemplateItem = (index: number, updates: Partial<CreateSOPTemplateItemPayload>) => {
    setTmplItems(
      tmplItems.map((item, idx) => (idx === index ? { ...item, ...updates } : item))
    );
  };

  const handleSaveCustomTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplTitle.trim()) {
      alert('Judul template SOP wajib diisi!');
      return;
    }
    if (tmplItems.some((it) => !it.task_name.trim())) {
      alert('Semua butir checklist wajib memiliki nama tugas!');
      return;
    }

    setIsSavingTemplate(true);
    let outletId: string | undefined = activeOutletId || undefined;
    if (!outletId || outletId === 'ALL') {
      outletId = accessibleOutlets[0]?.id || undefined;
    }

    const payload: CreateSOPTemplatePayload = {
      outlet_id: outletId,
      code: tmplCode.trim().toUpperCase() || `SOP-CUSTOM-${Date.now().toString().slice(-4)}`,
      title: tmplTitle.trim(),
      station: tmplStation,
      shift_phase: tmplPhase,
      description: tmplDescription.trim() || undefined,
      estimated_duration_minutes: tmplDuration || 15,
      items: tmplItems,
    };

    try {
      await createSOPTemplate(payload);
      refetchTemplates();
      setIsTemplateManagerOpen(false);
      // Reset form
      setTmplTitle('');
      setTmplDescription('');
      setTmplCode(`SOP-CUSTOM-${Date.now().toString().slice(-4)}`);
      setTmplItems([
        {
          task_name: 'Pemeriksaan kebersihan permukaan alat & stasiun',
          task_instruction: 'Pastikan bebas residu minyak dan debu sebelum beroperasi.',
          requires_photo: false,
          requires_numeric_input: false,
          numeric_unit: '',
          min_val: null,
          max_val: null,
          is_critical: false,
        },
      ]);
      alert('Template SOP kustom berhasil disimpan dan siap digunakan untuk checklist shift!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan template SOP');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await deleteSOPTemplate(templateId);
      setConfirmDeleteTemplateId(null);
      refetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus template');
    }
  };

  // Digital Handbook Handlers
  const handleOpenCreateHandbook = () => {
    setEditingHandbookArticle(null);
    setHbCategory(selectedHandbookCategory === 'ALL' ? 'STEAK_GRILL' : selectedHandbookCategory);
    setHbTitle('');
    setHbSubtitle('');
    setHbBadge('STANDAR RESEP');
    setHbContent('');
    setIsHandbookModalOpen(true);
  };

  const handleOpenEditHandbook = (article: SOPHandbookArticle) => {
    setEditingHandbookArticle(article);
    setHbCategory(article.category);
    setHbTitle(article.title);
    setHbSubtitle(article.subtitle || '');
    setHbBadge(article.badge_text || 'STANDAR F&B');
    setHbContent(article.content_markdown || '');
    setIsHandbookModalOpen(true);
  };

  const handleSaveHandbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hbTitle.trim()) {
      alert('Judul panduan SOP wajib diisi!');
      return;
    }
    if (!hbContent.trim()) {
      alert('Uraian isi panduan SOP wajib diisi!');
      return;
    }

    setIsSavingHandbook(true);
    try {
      if (editingHandbookArticle) {
        await updateHandbookArticle(editingHandbookArticle.id, {
          category: hbCategory,
          title: hbTitle.trim(),
          subtitle: hbSubtitle.trim(),
          badge_text: hbBadge.trim(),
          content_markdown: hbContent.trim(),
        });
      } else {
        await createHandbookArticle({
          category: hbCategory,
          title: hbTitle.trim(),
          subtitle: hbSubtitle.trim(),
          badge_text: hbBadge.trim(),
          content_markdown: hbContent.trim(),
        });
      }
      refetchHandbook();
      setIsHandbookModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan panduan SOP');
    } finally {
      setIsSavingHandbook(false);
    }
  };

  const handleDeleteHandbook = async (articleId: string) => {
    try {
      await deleteHandbookArticle(articleId);
      setConfirmDeleteHandbookId(null);
      refetchHandbook();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus artikel panduan');
    }
  };

  return (
    <PageTransition>
      <div className="tropical-glass space-y-6 max-w-7xl mx-auto pb-16 text-slate-800">
        {/* ========================================================================= */}
        {/* ENTERPRISE HERO HEADER BANNER (Harmonized Golden Reference Warm Sage Glass) */}
        {/* ========================================================================= */}
        <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                  <ClipboardCheck className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-slate-900">
                      SOP Operasional &amp; Kontrol Mutu Cabang
                    </h1>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                      Quality Gate
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                    Standardisasi harian divisi FOH &amp; BOH: checklist shift kerja, kalibrasi suhu grill/chiller, kebersihan gazebo, dan audit scorecard berkala.
                  </p>
                </div>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setTemplateViewMode('create');
                  setIsTemplateManagerOpen(true);
                }}
                className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              >
                <Settings className="size-4 text-emerald-600" />
                Desain SOP Kustom
              </button>

              {activeTab === 'checklists' && (
                <button
                  type="button"
                  onClick={() => setIsNewRunModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Mulai Sesi Checklist
                </button>
              )}

              {activeTab === 'audits' && (
                <button
                  type="button"
                  onClick={() => setIsNewAuditModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Input Rapor Audit Baru
                </button>
              )}

              {activeTab === 'handbook' && (
                <button
                  type="button"
                  onClick={handleOpenCreateHandbook}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Tambah Panduan SOP
                </button>
              )}
            </div>
          </div>

          {/* Navigation Command Cards (Golden Reference Architecture) */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tab 1: Checklist Harian Shift */}
            <button
              type="button"
              onClick={() => setActiveTab('checklists')}
              data-spot="workflow"
              data-active={activeTab === 'checklists'}
              aria-pressed={activeTab === 'checklists'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'checklists'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40 border-emerald-500'
                  : 'bg-white hover:bg-emerald-50/40 border-slate-200/90 hover:border-emerald-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'checklists' ? 'bg-emerald-500/50 text-white' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  <ClipboardCheck className="size-4" />
                </div>
                {safeRuns.length > 0 && (
                  <span
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-bold rounded-full',
                      activeTab === 'checklists' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    )}
                  >
                    {safeRuns.length} Sesi
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'checklists' ? 'text-white' : 'text-slate-900')}>
                  1. Checklist Harian Shift
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'checklists' ? 'text-emerald-100' : 'text-slate-600')}>
                  Verifikasi Suhu &amp; Tugas
                </div>
              </div>
            </button>

            {/* Tab 2: Rapor Audit Mutu (Scorecard) */}
            <button
              type="button"
              onClick={() => setActiveTab('audits')}
              data-spot="workflow"
              data-active={activeTab === 'audits'}
              aria-pressed={activeTab === 'audits'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'audits'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                  : 'bg-white hover:bg-amber-50/40 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'audits' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                  )}
                >
                  <Award className="size-4" />
                </div>
                {safeAudits.length > 0 && (
                  <span
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-bold rounded-full',
                      activeTab === 'audits' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900 border border-amber-200'
                    )}
                  >
                    {safeAudits.length} Audit
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'audits' ? 'text-white' : 'text-slate-900')}>
                  2. Rapor Audit Mutu (Scorecard)
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'audits' ? 'text-amber-100' : 'text-slate-600')}>
                  Evaluasi 4 Pilar Resto
                </div>
              </div>
            </button>

            {/* Tab 3: Buku Panduan SOP & Plating */}
            <button
              type="button"
              onClick={() => setActiveTab('handbook')}
              data-spot="workflow"
              data-active={activeTab === 'handbook'}
              aria-pressed={activeTab === 'handbook'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'handbook'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 border-indigo-500'
                  : 'bg-white hover:bg-indigo-50/40 border-slate-200/90 hover:border-indigo-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'handbook' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-100 text-indigo-800'
                  )}
                >
                  <BookOpen className="size-4" />
                </div>
                {safeHandbook.length > 0 && (
                  <span
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-bold rounded-full',
                      activeTab === 'handbook' ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                    )}
                  >
                    {safeHandbook.length} Panduan
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'handbook' ? 'text-white' : 'text-slate-900')}>
                  3. Buku Panduan SOP &amp; Plating
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'handbook' ? 'text-indigo-100' : 'text-slate-600')}>
                  Standardisasi Resep &amp; Dapur
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KPI SUMMARY STAT CARDS (Golden Reference Warm Sage Frosted Style) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Total Sesi Checklist</span>
              <span className="p-2 rounded-xl bg-teal-500/10 text-teal-700 border border-teal-200/50">
                <ClipboardCheck className="size-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              <SmoothNumber value={stats.total} format="number" />
            </div>
            <div className="text-xs font-semibold text-slate-600 mt-1">Seluruh divisi outlet</div>
          </div>

          <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Selesai Diverifikasi</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 border border-emerald-200/50">
                <CheckCircle2 className="size-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-2">
              <SmoothNumber value={stats.completed} format="number" suffix=" Sesi" />
            </div>
            <div className="text-xs font-semibold text-slate-600 mt-1">100% Passed Supervisor</div>
          </div>

          <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Sedang Berjalan</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-200/50">
                <Clock className="size-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-amber-700 mt-2">
              <SmoothNumber value={stats.inProgress} format="number" suffix=" Sesi" />
            </div>
            <div className="text-xs font-semibold text-slate-600 mt-1">Petugas shift aktif</div>
          </div>

          <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Peringatan Deviasi / Flag</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-700 border border-rose-200/50">
                <AlertTriangle className="size-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-rose-700 mt-2">
              <SmoothNumber value={stats.flagged} format="number" suffix=" Issue" />
            </div>
            <div className="text-xs font-semibold text-slate-600 mt-1">Parameter luar toleransi</div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: DAILY SHIFT CHECKLISTS */}
        {/* ========================================================================= */}
        {activeTab === 'checklists' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div data-spot="toolbar" className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari sesi SOP, nama tugas, atau staf..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>

                {/* Shift Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-bold">Shift:</span>
                  <select
                    value={selectedPhase}
                    onChange={(e) => setSelectedPhase(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">Semua Fase Shift</option>
                    <option value="OPENING">Opening Shift</option>
                    <option value="HANDOVER">Handover Shift</option>
                    <option value="CLOSING">Closing Shift</option>
                  </select>
                </div>
              </div>

              {/* Station Filter Pills */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                {[
                  { id: 'ALL', label: 'Semua Station' },
                  { id: 'GRILL_STEAK', label: '🥩 Dapur Grill & Steak' },
                  { id: 'DAPUR_NUSANTARA', label: '🍲 Dapur Nusantara' },
                  { id: 'BAR_MINUMAN', label: '🍹 Bar Minuman' },
                  { id: 'FOH_GAZEBO', label: '🎋 Gazebo & Kolam Koi' },
                  { id: 'KASIR_SAFETY', label: '🛡️ Kasir & Safety Resto' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStation(st.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shadow-2xs active:scale-95',
                      selectedStation === st.id
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist Runs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRuns.length === 0 && (
                <div className="col-span-full p-8 rounded-2xl bg-white border border-slate-200/90 text-center text-xs font-semibold text-slate-500 shadow-sm">
                  Tidak ada checklist aktif untuk filter ini. Mulai sesi checklist baru untuk mengisi tugas.
                </div>
              )}
              {filteredRuns.map((run) => {
                const progressPct =
                  run.total_items > 0
                    ? Math.round((run.completed_items / run.total_items) * 100)
                    : 0;

                const isDone = run.status === 'COMPLETED';
                const isFlagged = run.status === 'FLAGGED_ISSUE' || run.flagged_items > 0;

                return (
                  <div
                    key={run.id}
                    data-spot="card"
                    className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                              {run.template_code}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">
                              {run.station}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                            {run.template_title || run.template_code}
                          </h3>
                        </div>

                        <span
                          className={cn(
                            'text-[10px] font-black px-2.5 py-0.5 rounded-full border',
                            isDone
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : isFlagged
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          )}
                        >
                          {isDone ? 'SELESAI' : isFlagged ? 'FLAGGED ISSUE' : 'IN PROGRESS'}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 font-semibold">Progres Item</span>
                          <span className="font-bold text-slate-900">
                            {run.completed_items}/{run.total_items} ({progressPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all duration-300',
                              isDone ? 'bg-emerald-600' : isFlagged ? 'bg-rose-600' : 'bg-amber-500'
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="text-[11px] text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                        <p>
                          <span className="text-slate-500">Staf Penanggung Jawab:</span>{' '}
                          <span className="text-slate-900 font-semibold">{run.assigned_to_name || 'Staf Divisi'}</span>
                        </p>
                        {run.supervisor_name && (
                          <p>
                            <span className="text-slate-500">Review SPV:</span>{' '}
                            <span className="text-emerald-800 font-semibold">{run.supervisor_name}</span>
                          </p>
                        )}
                        {run.supervisor_notes && (
                          <p className="text-slate-700 italic text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            &ldquo;{run.supervisor_notes}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Button: High Affordance */}
                    <div className="pt-4 mt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const fullRun = await fetchSOPChecklistRunDetail(run.id);
                            setActiveRunModal(fullRun);
                          } catch (err) {
                            console.error(err);
                            setActiveRunModal(run);
                          }
                        }}
                        className={cn(
                          'w-full font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md cursor-pointer active:scale-95 border',
                          isDone
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-500 shadow-emerald-700/20'
                        )}
                      >
                        <ClipboardCheck className="size-4" />
                        {isDone ? 'Buka Ringkasan Verifikasi' : 'Buka & Isi Checklist'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RAPOR AUDIT MUTU RESTO */}
        {/* ========================================================================= */}
        {activeTab === 'audits' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Award className="size-5 text-emerald-600" />
                  Rapor Audit Mutu & Standar Operasional Resto
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                  Evaluasi berkala 4 pilar mutu: Mutu Makanan (30%), Kecepatan (25%), Sanitasi (25%), Keselamatan (20%).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewAuditModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="size-4" />
                Input Rapor Audit Baru
              </button>
            </div>

            {/* Empty State when no audits exist */}
            {!latestAudit && (
              <div className="p-12 rounded-3xl bg-white border border-slate-200/90 text-center space-y-4 shadow-sm">
                <div className="size-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
                  <Award className="size-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Belum Ada Rapor Audit Mutu untuk Outlet Ini</h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto font-semibold">
                    Audit mutu berkala mengevaluasi 4 pilar standar: Mutu Makanan (30%), Kecepatan Saji (25%), Sanitasi (25%), dan Keselamatan (20%).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewAuditModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-2xl shadow-md cursor-pointer active:scale-95"
                >
                  <Plus className="size-4 mr-1.5 inline" />
                  Mulai Rapor Audit Mutu Pertama
                </button>
              </div>
            )}

            {/* Latest Audit Highlight Banner (Golden Reference Warm Sage Glass Card) */}
            {latestAudit && (
              <div data-spot="panel" className="rounded-3xl bg-white border border-slate-200/90 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300">
                        AUDIT TERAKHIR ({latestAudit.audit_number})
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">{latestAudit.audit_date}</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900">
                      Rapor Skor Mutu Operasional: {latestAudit.outlet_name || 'Tropical Steak House'}
                    </h2>
                    <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-semibold">
                      {latestAudit.summary_notes || 'Seluruh aspek mutu makanan, sanitasi saung gazebo, dan keselamatan gas LPG dievaluasi berkala.'}
                    </p>
                  </div>

                  {/* Big Score Box */}
                  <div className="flex items-center gap-4 bg-emerald-50/70 border border-emerald-200 px-6 py-4 rounded-2xl">
                    <div className="text-right">
                      <p className="text-[10px] font-extrabold uppercase text-emerald-900/80">Total Nilai Tertimbang</p>
                      <p className="text-3xl font-black text-emerald-800">
                        {latestAudit.total_weighted_score.toFixed(2)}%
                      </p>
                    </div>
                    <div className="size-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black text-2xl shadow-md shadow-emerald-600/30">
                      {latestAudit.overall_grade.split('_')[0]}
                    </div>
                  </div>
                </div>

                {/* 4 Pillars Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <p className="text-xs text-slate-600 font-bold">Mutu &amp; Rasa Makanan (30%)</p>
                    <p className="text-xl font-black text-amber-700 mt-1">
                      <SmoothNumber value={latestAudit.score_food_quality} format="percent" decimals={0} />
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <p className="text-xs text-slate-600 font-bold">Kecepatan Saji (25%)</p>
                    <p className="text-xl font-black text-indigo-700 mt-1">
                      <SmoothNumber value={latestAudit.score_service_speed} format="percent" decimals={0} />
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <p className="text-xs text-slate-600 font-bold">Kebersihan &amp; Sanitasi (25%)</p>
                    <p className="text-xl font-black text-emerald-700 mt-1">
                      <SmoothNumber value={latestAudit.score_cleanliness} format="percent" decimals={0} />
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <p className="text-xs text-slate-600 font-bold">Keselamatan &amp; Alat (20%)</p>
                    <p className="text-xl font-black text-purple-700 mt-1">
                      <SmoothNumber value={latestAudit.score_safety_equipment} format="percent" decimals={0} />
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Items / Temuan Audit */}
            {latestAudit && (
              <div data-spot="table" className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-600" />
                      Tiket Temuan & Tindakan Korektif Audit Lapangan
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                      Daftar perbaikan fisik yang harus ditindaklanjuti oleh Manager Outlet dan Supervisor.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase">
                        <th className="py-3 px-3">Area / Stasiun</th>
                        <th className="py-3 px-3">Uraian Temuan Masalah</th>
                        <th className="py-3 px-3">Tindakan Korektif</th>
                        <th className="py-3 px-3">Tingkat Risiko</th>
                        <th className="py-3 px-3">PIC Role</th>
                        <th className="py-3 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {latestAudit.action_items && latestAudit.action_items.length > 0 ? (
                        latestAudit.action_items.map((act) => {
                          const isResolved = act.status === 'RESOLVED';
                          return (
                            <tr key={act.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                                {act.area}
                              </td>
                              <td className="py-3 px-3 text-slate-700 max-w-xs">{act.issue_description}</td>
                              <td className="py-3 px-3 text-slate-600 max-w-xs">{act.corrective_action}</td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                    act.severity === 'CRITICAL' || act.severity === 'HIGH'
                                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                                      : 'bg-amber-50 text-amber-800 border-amber-300'
                                  )}
                                >
                                  {act.severity}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-700 whitespace-nowrap font-medium">
                                {act.assigned_to_role}
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleResolveActionItem(act.id, act.status)}
                                  className={cn(
                                    'text-xs font-black px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer ml-auto',
                                    isResolved
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 border border-amber-400 font-black shadow-amber-500/20'
                                  )}
                                >
                                  {isResolved ? (
                                    <>
                                      <CheckCircle2 className="size-3.5 text-emerald-700" />
                                      <span>Tuntas (Buka)</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="size-3.5 text-slate-950" />
                                      <span>Selesaikan</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-xs font-semibold text-slate-500">
                            Tidak ada tiket temuan masalah pada audit ini. Seluruh standar operasional terpenuhi dengan baik.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DIGITAL SOP KNOWLEDGE BASE (DYNAMIC FROM DATABASE) */}
        {/* ========================================================================= */}
        {activeTab === 'handbook' && (
          <div className="space-y-6">
            {/* Top Toolbar: Category Filter & Add Guide Button */}
            <div data-spot="toolbar" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-700 font-bold mr-1">Kategori:</span>
                {[
                  { id: 'ALL', label: 'Semua Kategori' },
                  { id: 'STEAK_GRILL', label: '🥩 Dapur Steak & Grill' },
                  { id: 'PORTIONING_HPA', label: '⚖️ Standar Porsi & HPA' },
                  { id: 'GARDEN_AREA', label: '🎋 Saung Gazebo & Kolam Koi' },
                  { id: 'SAFETY_EQUIPMENT', label: '🛡️ Safety Gas LPG & APAR' },
                  { id: 'GENERAL_SERVICE', label: '🛎️ Layanan & Kasir' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedHandbookCategory(cat.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shadow-2xs active:scale-95',
                      selectedHandbookCategory === cat.id
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleOpenCreateHandbook}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-2xl shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="size-4" />
                Tambah Panduan Baru
              </button>
            </div>

            {/* Handbook Articles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {safeHandbook.length === 0 && (
                <div className="col-span-full p-8 rounded-2xl bg-white border border-slate-200/90 text-center text-xs font-semibold text-slate-500 shadow-sm">
                  Belum ada panduan SOP untuk kategori ini. Klik &quot;Tambah Panduan Baru&quot; untuk menambahkan standar panduan operasional mandiri.
                </div>
              )}

              {safeHandbook.map((article) => {
                const getIcon = () => {
                  if (article.category === 'STEAK_GRILL') return <Flame className="size-5" />;
                  if (article.category === 'PORTIONING_HPA') return <ChefHat className="size-5" />;
                  if (article.category === 'GARDEN_AREA') return <Sparkles className="size-5" />;
                  if (article.category === 'SAFETY_EQUIPMENT') return <ShieldAlert className="size-5" />;
                  return <BookOpen className="size-5" />;
                };

                const getIconColor = () => {
                  if (article.category === 'STEAK_GRILL') return 'bg-amber-100 text-amber-800 border-amber-300';
                  if (article.category === 'PORTIONING_HPA') return 'bg-purple-100 text-purple-800 border-purple-300';
                  if (article.category === 'GARDEN_AREA') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  if (article.category === 'SAFETY_EQUIPMENT') return 'bg-rose-100 text-rose-800 border-rose-300';
                  return 'bg-blue-100 text-blue-800 border-blue-300';
                };

                return (
                  <div
                    key={article.id}
                    className="rounded-2xl bg-white border border-slate-200/90 p-6 space-y-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('flex size-9 items-center justify-center rounded-xl border', getIconColor())}>
                            {getIcon()}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                                {article.badge_text || article.category}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 mt-1">{article.title}</h3>
                            {article.subtitle && (
                              <p className="text-xs text-slate-600 font-semibold">{article.subtitle}</p>
                            )}
                          </div>
                        </div>

                        {/* Article Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditHandbook(article)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Panduan"
                          >
                            <Edit3 className="size-4" />
                          </button>
                          {confirmDeleteHandbookId === article.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDeleteHandbook(article.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Ya, Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteHandbookId(null)}
                                className="px-2 py-1 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteHandbookId(article.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus Panduan"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content Formatted Preview */}
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                        {article.content_markdown}
                      </div>
                    </div>

                    <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-100">
                      <span>Diperbarui: {new Date(article.updated_at).toLocaleDateString('id-ID')}</span>
                      <span className="font-semibold text-slate-600">Standard Operasional Mandiri</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DETAIL & EXECUTION CHECKLIST RUN */}
        {/* ========================================================================= */}
        {activeRunModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6 max-h-[90vh] flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                      {activeRunModal.station} • {activeRunModal.shift_phase}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 mt-1.5">
                      {activeRunModal.template_title || activeRunModal.template_code}
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold">
                      Tanggal: {activeRunModal.run_date} • Shift: {activeRunModal.shift_name} • Staf: {activeRunModal.assigned_to_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRunModal(null)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Task Items List */}
                <div className="py-4 space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {(activeRunModal.records || []).map((rec, idx) => {
                    const isChecked = rec.is_checked;
                    const isCritical = rec.is_critical;
                    const reqNum = rec.requires_numeric_input;

                    return (
                      <div
                        key={rec.id}
                        className={cn(
                          'p-4 rounded-2xl border transition-all space-y-2',
                          rec.flagged
                            ? 'bg-rose-50/60 border-rose-300'
                            : isChecked
                            ? 'bg-emerald-50/60 border-emerald-300'
                            : 'bg-slate-50 border-slate-200'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleItem(activeRunModal, rec.id, isChecked, rec.numeric_actual_value)}
                            className="size-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                #{idx + 1}. {rec.task_name}
                              </span>
                              {isCritical && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-50 text-rose-800 border border-rose-300">
                                  CRITICAL
                                </span>
                              )}
                              {rec.flagged && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-600 text-white animate-pulse">
                                  Di Luar Batas Standar!
                                </span>
                              )}
                            </div>
                            {rec.task_instruction && (
                              <p className="text-[11px] text-slate-600 mt-0.5 font-medium">{rec.task_instruction}</p>
                            )}
                          </div>
                        </div>

                        {/* Numeric Input & Photo Proof Row with NumberInput Component */}
                        <div className="flex flex-wrap items-center gap-3 pl-8 pt-1">
                          {reqNum && (
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                              <Thermometer className="size-3.5 text-slate-500" />
                              <span className="text-[11px] text-slate-600 font-semibold">Nilai Ukur:</span>
                              <div className="w-24">
                                <NumberInput
                                  value={rec.numeric_actual_value ?? 0}
                                  onChange={(val) => handleNumericChange(activeRunModal, rec.id, val, isChecked)}
                                  suffix={rec.numeric_unit}
                                  className="bg-slate-50 border-slate-300 text-slate-900 text-xs h-7 py-1 px-2"
                                />
                              </div>
                              {rec.min_val !== null && rec.max_val !== null && (
                                <span className="text-[10px] text-slate-500 ml-1 font-semibold">
                                  (Standar: {rec.min_val} s/d {rec.max_val} {rec.numeric_unit})
                                </span>
                              )}
                            </div>
                          )}

                          {rec.photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoPreview(rec.photo_url || null)}
                              className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-300 cursor-pointer"
                            >
                              <Camera className="size-3.5" />
                              Bukti Foto Terlampir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveRunModal(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-6 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>

                {activeRunModal.status !== 'COMPLETED' && (
                  <Button
                    variant="primary"
                    onClick={() => handleCompleteRun(activeRunModal.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-emerald-600/30 cursor-pointer"
                  >
                    <CheckCircle2 className="size-4 mr-1.5" />
                    Tandai Selesai & Tinjau SPV
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CUSTOM SOP TEMPLATE BUILDER & MANAGER */}
        {/* ========================================================================= */}
        {isTemplateManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6 max-h-[92vh] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Settings className="size-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Kustomisasi & Desain Template SOP Mandiri
                      </h2>
                      <p className="text-xs text-slate-600 font-medium">
                        Buat formulir checklist mandiri sesuai ketentuan stasiun dan kebutuhan dapur resto.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTemplateManagerOpen(false)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Switch between Builder and List */}
                <div className="flex gap-2 my-4 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setTemplateViewMode('create')}
                    className={cn(
                      'flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer',
                      templateViewMode === 'create'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    + Buat Template Baru
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateViewMode('list')}
                    className={cn(
                      'flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer',
                      templateViewMode === 'list'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    Daftar Template SOP Aktif ({safeTemplates.length})
                  </button>
                </div>

                {templateViewMode === 'create' ? (
                  <form onSubmit={handleSaveCustomTemplate} className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Kode Template SOP *
                        </label>
                        <input
                          type="text"
                          required
                          value={tmplCode}
                          onChange={(e) => setTmplCode(e.target.value)}
                          placeholder="Cth: SOP-GRILL-02"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 uppercase font-mono focus:bg-white focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Estimasi Waktu Pengerjaan (Menit) *
                        </label>
                        <NumberInput
                          min={1}
                          max={180}
                          value={tmplDuration}
                          onChange={(val) => setTmplDuration(val || 15)}
                          suffix="Menit"
                          className="bg-slate-50 border-slate-300 text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Judul SOP Checklist *
                      </label>
                      <input
                        type="text"
                        required
                        value={tmplTitle}
                        onChange={(e) => setTmplTitle(e.target.value)}
                        placeholder="Cth: Pemeriksaan Sanitasi Chiller & Griddle Sore"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Stasiun / Divisi *
                        </label>
                        <select
                          value={tmplStation}
                          onChange={(e) => setTmplStation(e.target.value as StationType)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold focus:bg-white focus:border-emerald-500"
                        >
                          <option value="GRILL_STEAK">🥩 Dapur Grill & Steak</option>
                          <option value="DAPUR_NUSANTARA">🍲 Dapur Nusantara</option>
                          <option value="BAR_MINUMAN">🍹 Bar Minuman</option>
                          <option value="FOH_GAZEBO">🎋 Gazebo & Kolam Koi</option>
                          <option value="KASIR_SAFETY">🛡️ Kasir & Safety Resto</option>
                          <option value="CLEANING_TAMAN">🧹 Kebersihan & Area Luar</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Fase Shift *
                        </label>
                        <select
                          value={tmplPhase}
                          onChange={(e) => setTmplPhase(e.target.value as ShiftPhaseType)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold focus:bg-white focus:border-emerald-500"
                        >
                          <option value="OPENING">Opening Shift (Buka Resto)</option>
                          <option value="HANDOVER">Handover Shift (Oper Ganti)</option>
                          <option value="CLOSING">Closing Shift (Tutup Resto)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Deskripsi / Petunjuk Umum
                      </label>
                      <textarea
                        rows={2}
                        value={tmplDescription}
                        onChange={(e) => setTmplDescription(e.target.value)}
                        placeholder="Deskripsi singkat target mutu atau instruksi pimpinan..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                      />
                    </div>

                    {/* Dynamic Checklist Items */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Layers className="size-4 text-emerald-600" />
                          Daftar Butir Pemeriksaan Checklist ({tmplItems.length} Poin)
                        </span>
                        <button
                          type="button"
                          onClick={handleAddTemplateItem}
                          className="text-xs font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          Tambah Butir Tugas
                        </button>
                      </div>

                      <div className="space-y-3">
                        {tmplItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-xs text-emerald-700 shrink-0 mt-2">
                                #{idx + 1}
                              </span>
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  required
                                  value={item.task_name}
                                  onChange={(e) => handleUpdateTemplateItem(idx, { task_name: e.target.value })}
                                  placeholder="Nama tugas checklist (wajib)..."
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900"
                                />
                                <input
                                  type="text"
                                  value={item.task_instruction || ''}
                                  onChange={(e) => handleUpdateTemplateItem(idx, { task_instruction: e.target.value })}
                                  placeholder="Instruksi tambahan bagi petugas..."
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-[11px] text-slate-600"
                                />
                              </div>
                              {tmplItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTemplateItem(idx)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                                  title="Hapus butir"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>

                            {/* Toggles */}
                            <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-200 text-xs text-slate-600 font-semibold">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.is_critical}
                                  onChange={(e) => handleUpdateTemplateItem(idx, { is_critical: e.target.checked })}
                                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                />
                                <span className={item.is_critical ? 'text-rose-700 font-bold' : ''}>Poin Kritis</span>
                              </label>

                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.requires_photo}
                                  onChange={(e) => handleUpdateTemplateItem(idx, { requires_photo: e.target.checked })}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <span>Wajib Foto Bukti</span>
                              </label>

                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.requires_numeric_input}
                                  onChange={(e) => handleUpdateTemplateItem(idx, { requires_numeric_input: e.target.checked })}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <span>Input Angka / Suhu</span>
                              </label>
                            </div>

                            {/* Numeric bounds inputs if enabled */}
                            {item.requires_numeric_input && (
                              <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-white border border-slate-200">
                                <div>
                                  <label className="text-[10px] text-slate-600 font-bold block mb-0.5">Satuan Ukur</label>
                                  <input
                                    type="text"
                                    value={item.numeric_unit || ''}
                                    onChange={(e) => handleUpdateTemplateItem(idx, { numeric_unit: e.target.value })}
                                    placeholder="Cth: °C, Gram"
                                    className="w-full px-2 py-1 rounded bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-600 font-bold block mb-0.5">Batas Minimum</label>
                                  <NumberInput
                                    value={item.min_val ?? 0}
                                    onChange={(val) => handleUpdateTemplateItem(idx, { min_val: val })}
                                    className="bg-slate-50 border-slate-300 text-slate-900 text-xs h-7 py-1 px-2"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-600 font-bold block mb-0.5">Batas Maksimum</label>
                                  <NumberInput
                                    value={item.max_val ?? 100}
                                    onChange={(val) => handleUpdateTemplateItem(idx, { max_val: val })}
                                    className="bg-slate-50 border-slate-300 text-slate-900 text-xs h-7 py-1 px-2"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsTemplateManagerOpen(false)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                      >
                        Batal
                      </button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isSavingTemplate}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md cursor-pointer"
                      >
                        {isSavingTemplate ? 'Menyimpan...' : 'Simpan Template SOP'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* Template List View */
                  <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
                    {safeTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300">
                              {tmpl.code}
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                              {tmpl.station} • {tmpl.shift_phase}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">{tmpl.title}</h4>
                          {tmpl.description && (
                            <p className="text-xs text-slate-600 mt-0.5 font-medium">{tmpl.description}</p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                            Durasi: {tmpl.estimated_duration_minutes} Menit • {tmpl.items?.length || 0} butir pemeriksaan
                          </p>
                        </div>
                        {confirmDeleteTemplateId === tmpl.id ? (
                          <div className="inline-flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleDeleteTemplate(tmpl.id)}
                              className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTemplateId(null)}
                              className="px-2.5 py-1 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTemplateId(tmpl.id)}
                            className="p-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                            title="Hapus template"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DIGITAL HANDBOOK ADD / EDIT */}
        {/* ========================================================================= */}
        {isHandbookModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <BookOpen className="size-5" />
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingHandbookArticle ? 'Edit Panduan SOP Digital' : 'Tambah Panduan SOP Mandiri'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHandbookModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleSaveHandbook} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kategori Panduan *
                    </label>
                    <select
                      value={hbCategory}
                      onChange={(e) => setHbCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold focus:bg-white focus:border-emerald-500"
                    >
                      <option value="STEAK_GRILL">🥩 Dapur Steak & Grill</option>
                      <option value="PORTIONING_HPA">⚖️ Standar Porsi & HPA</option>
                      <option value="GARDEN_AREA">🎋 Saung Gazebo & Kolam Koi</option>
                      <option value="SAFETY_EQUIPMENT">🛡️ Safety Gas LPG & APAR</option>
                      <option value="GENERAL_SERVICE">🛎️ Layanan & Kasir</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Badge Label
                    </label>
                    <input
                      type="text"
                      value={hbBadge}
                      onChange={(e) => setHbBadge(e.target.value)}
                      placeholder="Cth: STANDAR RESEP"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 uppercase font-mono focus:bg-white focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Judul Panduan SOP *
                  </label>
                  <input
                    type="text"
                    required
                    value={hbTitle}
                    onChange={(e) => setHbTitle(e.target.value)}
                    placeholder="Cth: Standar Kalibrasi Griddle & Suhu Chiller"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Subjudul / Deskripsi Singkat
                  </label>
                  <input
                    type="text"
                    value={hbSubtitle}
                    onChange={(e) => setHbSubtitle(e.target.value)}
                    placeholder="Cth: Panduan koki untuk menjaga konsistensi rasa dan gramasi."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Uraian Isi Panduan / Ketentuan *
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={hbContent}
                    onChange={(e) => setHbContent(e.target.value)}
                    placeholder={`Tuliskan rincian langkah, gramasi, suhu, atau instruksi kerja secara bebas dan rapi di sini...`}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono leading-relaxed focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsHandbookModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <Button
                    type="submit"
                    disabled={isSavingHandbook}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md cursor-pointer"
                  >
                    {isSavingHandbook ? 'Menyimpan...' : 'Simpan Panduan'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: MULAI SESI CHECKLIST BARU */}
        {/* ========================================================================= */}
        {isNewRunModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-emerald-600" />
                  Mulai Sesi Checklist Shift Baru
                </h2>
                <button
                  type="button"
                  onClick={() => setIsNewRunModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleCreateRun} className="py-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Template SOP:
                  </label>
                  <select
                    value={newRunTemplateId}
                    onChange={(e) => setNewRunTemplateId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="">-- Pilih Template Checklist --</option>
                    {safeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.title} ({t.shift_phase})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilihan Shift Kerja:
                  </label>
                  <select
                    value={newRunShiftName}
                    onChange={(e) => setNewRunShiftName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="SHIFT_PAGI">Shift Pagi (Opening s.d. Siang)</option>
                    <option value="SHIFT_SORE">Shift Sore (Malam s.d. Closing)</option>
                    <option value="SHIFT_MIDDLE">Shift Middle (Jamuan & Event)</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsNewRunModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isCreatingRun}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md cursor-pointer"
                  >
                    {isCreatingRun ? 'Membuat...' : 'Mulai Sekarang'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: INPUT QUALITY AUDIT (USING NUMBERINPUT) */}
        {/* ========================================================================= */}
        {isNewAuditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200/90 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Award className="size-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Formulir Audit Mutu Operasional Resto
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewAuditModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAudit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mutu Makanan (0-100)
                    </label>
                    <NumberInput
                      min={0}
                      max={100}
                      value={auditFoodScore}
                      onChange={setAuditFoodScore}
                      suffix="%"
                      className="bg-slate-50 border-slate-300 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kecepatan Saji (0-100)
                    </label>
                    <NumberInput
                      min={0}
                      max={100}
                      value={auditSpeedScore}
                      onChange={setAuditSpeedScore}
                      suffix="%"
                      className="bg-slate-50 border-slate-300 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kebersihan & Sanitasi (0-100)
                    </label>
                    <NumberInput
                      min={0}
                      max={100}
                      value={auditCleanScore}
                      onChange={setAuditCleanScore}
                      suffix="%"
                      className="bg-slate-50 border-slate-300 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Keselamatan & Alat (0-100)
                    </label>
                    <NumberInput
                      min={0}
                      max={100}
                      value={auditSafetyScore}
                      onChange={setAuditSafetyScore}
                      suffix="%"
                      className="bg-slate-50 border-slate-300 text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ringkasan Hasil Inspeksi & Rekomendasi:
                  </label>
                  <textarea
                    rows={3}
                    value={auditNotes}
                    onChange={(e) => setAuditNotes(e.target.value)}
                    placeholder="Tuliskan catatan detail audit outlet..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsNewAuditModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <Button
                    type="submit"
                    disabled={isCreatingAudit}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
                  >
                    {isCreatingAudit ? 'Menyimpan...' : 'Simpan Rapor Audit'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: PHOTO PREVIEW ZOOM */}
        {/* ========================================================================= */}
        {selectedPhotoPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200/90 p-4 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Camera className="size-4 text-emerald-600" />
                  Bukti Foto Lapangan Petugas
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoPreview(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-[60vh]">
                <img
                  src={selectedPhotoPreview}
                  alt="Bukti Checklist"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setSelectedPhotoPreview(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 px-5 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};
