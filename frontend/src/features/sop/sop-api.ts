import { api } from '@/shared/api/client';
import type {
  CreateChecklistRunPayload,
  CompleteChecklistRunPayload,
  CreateQualityAuditPayload,
  QualityAudit,
  SOPChecklistItemRecord,
  SOPChecklistRun,
  SOPTemplate,
  UpdateActionItemStatusPayload,
  UpdateChecklistItemPayload,
  AuditActionItem,
  SOPHandbookArticle,
  CreateHandbookArticlePayload,
  UpdateHandbookArticlePayload,
  CreateSOPTemplatePayload,
  UpdateSOPTemplatePayload,
} from './types';

// SOP Templates
export async function fetchSOPTemplates(
  outletId?: string,
  station?: string,
  shiftPhase?: string
): Promise<SOPTemplate[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (station && station !== 'ALL') params.append('station', station);
  if (shiftPhase && shiftPhase !== 'ALL') params.append('shift_phase', shiftPhase);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<SOPTemplate>(`/api/v1/sop/templates${q}`);
  return res ?? [];
}

// SOP Checklist Runs
export async function fetchSOPChecklistRuns(
  outletId?: string,
  date?: string,
  status?: string
): Promise<SOPChecklistRun[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (date) params.append('date', date);
  if (status && status !== 'ALL') params.append('status', status);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<SOPChecklistRun>(`/api/v1/sop/runs${q}`);
  return res ?? [];
}

export async function fetchSOPChecklistRunDetail(runId: string): Promise<SOPChecklistRun> {
  const res = await api.request<SOPChecklistRun>(`/api/v1/sop/runs/${runId}`);
  return {
    ...res,
    records: res?.records ?? [],
  };
}

export async function createSOPChecklistRun(
  payload: CreateChecklistRunPayload
): Promise<SOPChecklistRun> {
  const res = await api.request<SOPChecklistRun>('/api/v1/sop/runs', {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    records: res?.records ?? [],
  };
}

export async function updateSOPChecklistItem(
  runId: string,
  recordId: string,
  payload: UpdateChecklistItemPayload
): Promise<SOPChecklistItemRecord> {
  return api.request<SOPChecklistItemRecord>(`/api/v1/sop/runs/${runId}/items/${recordId}`, {
    method: 'PUT',
    body: payload,
  });
}

export async function completeSOPChecklistRun(
  runId: string,
  payload: CompleteChecklistRunPayload
): Promise<SOPChecklistRun> {
  const res = await api.request<SOPChecklistRun>(`/api/v1/sop/runs/${runId}/complete`, {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    records: res?.records ?? [],
  };
}

// Quality Audits & Scorecards
export async function fetchQualityAudits(outletId?: string): Promise<QualityAudit[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<QualityAudit>(`/api/v1/sop/audits${q}`);
  return res ?? [];
}

export async function createQualityAudit(
  payload: CreateQualityAuditPayload
): Promise<QualityAudit> {
  const res = await api.request<QualityAudit>('/api/v1/sop/audits', {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    action_items: res?.action_items ?? [],
  };
}

export async function updateAuditActionItemStatus(
  actionId: string,
  payload: UpdateActionItemStatusPayload
): Promise<AuditActionItem> {
  return api.request<AuditActionItem>(`/api/v1/sop/audits/actions/${actionId}`, {
    method: 'PUT',
    body: payload,
  });
}

// Custom SOP Template Creation & Management
export async function createSOPTemplate(
  payload: CreateSOPTemplatePayload
): Promise<SOPTemplate> {
  const res = await api.request<SOPTemplate>('/api/v1/sop/templates', {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    items: res?.items ?? [],
  };
}

export async function updateSOPTemplate(
  id: string,
  payload: UpdateSOPTemplatePayload
): Promise<SOPTemplate> {
  const res = await api.request<SOPTemplate>(`/api/v1/sop/templates/${id}`, {
    method: 'PUT',
    body: payload,
  });
  return {
    ...res,
    items: res?.items ?? [],
  };
}

export async function deleteSOPTemplate(id: string): Promise<{ success: boolean }> {
  return api.request<{ success: boolean }>(`/api/v1/sop/templates/${id}`, {
    method: 'DELETE',
  });
}

// Digital Handbook Guidelines
export async function fetchHandbookArticles(category?: string): Promise<SOPHandbookArticle[]> {
  const params = new URLSearchParams();
  if (category && category !== 'ALL') params.append('category', category);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<SOPHandbookArticle>(`/api/v1/sop/handbook${q}`);
  return res ?? [];
}

export async function createHandbookArticle(
  payload: CreateHandbookArticlePayload
): Promise<SOPHandbookArticle> {
  return api.request<SOPHandbookArticle>('/api/v1/sop/handbook', {
    method: 'POST',
    body: payload,
  });
}

export async function updateHandbookArticle(
  id: string,
  payload: UpdateHandbookArticlePayload
): Promise<SOPHandbookArticle> {
  return api.request<SOPHandbookArticle>(`/api/v1/sop/handbook/${id}`, {
    method: 'PUT',
    body: payload,
  });
}

export async function deleteHandbookArticle(id: string): Promise<{ success: boolean }> {
  return api.request<{ success: boolean }>(`/api/v1/sop/handbook/${id}`, {
    method: 'DELETE',
  });
}
