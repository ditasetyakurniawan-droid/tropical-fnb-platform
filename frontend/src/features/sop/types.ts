export type StationType =
  | 'GRILL_STEAK'
  | 'DAPUR_NUSANTARA'
  | 'BAR_MINUMAN'
  | 'FOH_GAZEBO'
  | 'KASIR_SAFETY'
  | 'CLEANING_TAMAN';

export type ShiftPhaseType = 'OPENING' | 'HANDOVER' | 'CLOSING';

export type RunStatusType = 'IN_PROGRESS' | 'COMPLETED' | 'FLAGGED_ISSUE';

export type OverallGradeType =
  | 'A_EXCELLENT'
  | 'B_GOOD'
  | 'C_NEEDS_IMPROVEMENT'
  | 'D_CRITICAL';

export interface SOPTemplateItem {
  id: string;
  template_id: string;
  sort_order: number;
  task_name: string;
  task_instruction?: string | undefined;
  requires_photo: boolean;
  requires_numeric_input: boolean;
  numeric_unit?: string | undefined;
  min_val?: number | undefined;
  max_val?: number | undefined;
  is_critical: boolean;
  created_at: string;
}

export interface SOPTemplate {
  id: string;
  tenant_id: string;
  outlet_id?: string | undefined;
  code: string;
  title: string;
  station: StationType;
  shift_phase: ShiftPhaseType;
  description?: string | undefined;
  estimated_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: SOPTemplateItem[] | undefined;
}

export interface SOPChecklistItemRecord {
  id: string;
  run_id: string;
  template_item_id: string;
  task_name: string;
  task_instruction?: string | undefined;
  requires_photo: boolean;
  requires_numeric_input: boolean;
  numeric_unit?: string | undefined;
  min_val?: number | undefined;
  max_val?: number | undefined;
  is_critical: boolean;
  is_checked: boolean;
  numeric_actual_value?: number | undefined;
  is_within_range: boolean;
  photo_url?: string | undefined;
  notes?: string | undefined;
  flagged: boolean;
  completed_at?: string | undefined;
  created_at: string;
}

export interface SOPChecklistRun {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code?: string | undefined;
  outlet_name?: string | undefined;
  template_id: string;
  template_code?: string | undefined;
  template_title?: string | undefined;
  station: StationType;
  shift_phase: ShiftPhaseType;
  run_date: string; // YYYY-MM-DD
  shift_name: string;
  assigned_to_user_id: string;
  assigned_to_name?: string | undefined;
  supervisor_user_id?: string | undefined;
  supervisor_name?: string | undefined;
  status: RunStatusType;
  started_at: string;
  completed_at?: string | undefined;
  total_items: number;
  completed_items: number;
  flagged_items: number;
  supervisor_notes?: string | undefined;
  created_at: string;
  updated_at: string;
  records?: SOPChecklistItemRecord[] | undefined;
}

export interface AuditActionItem {
  id: string;
  audit_id: string;
  area: string;
  issue_description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  corrective_action: string;
  assigned_to_role: string;
  due_date: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  resolution_notes?: string | undefined;
  resolved_at?: string | undefined;
  created_at: string;
}

export interface QualityAudit {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code?: string | undefined;
  outlet_name?: string | undefined;
  audit_number: string;
  auditor_user_id: string;
  auditor_name?: string | undefined;
  audit_date: string;
  audit_type: string;
  score_food_quality: number;
  score_service_speed: number;
  score_cleanliness: number;
  score_safety_equipment: number;
  total_weighted_score: number;
  overall_grade: OverallGradeType;
  summary_notes?: string | undefined;
  action_items?: AuditActionItem[] | undefined;
  created_at: string;
  updated_at: string;
}

export interface CreateChecklistRunPayload {
  outlet_id: string;
  template_id: string;
  shift_name: string;
}

export interface UpdateChecklistItemPayload {
  is_checked: boolean;
  numeric_actual_value?: number | undefined;
  photo_url?: string | undefined;
  notes?: string | undefined;
}

export interface CompleteChecklistRunPayload {
  supervisor_notes: string;
}

export interface CreateQualityAuditPayload {
  outlet_id: string;
  audit_type: string;
  score_food_quality: number;
  score_service_speed: number;
  score_cleanliness: number;
  score_safety_equipment: number;
  summary_notes: string;
  action_items?: Array<{
    area: string;
    issue_description: string;
    severity: string;
    corrective_action: string;
    assigned_to_role: string;
    due_date: string;
  }> | undefined;
}

export interface UpdateActionItemStatusPayload {
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  resolution_notes: string;
}

export interface SOPHandbookArticle {
  id: string;
  tenant_id: string;
  outlet_id?: string | undefined;
  category: string;
  title: string;
  subtitle?: string | undefined;
  badge_text?: string | undefined;
  icon_name?: string | undefined;
  content_markdown: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateHandbookArticlePayload {
  outlet_id?: string | undefined;
  category: string;
  title: string;
  subtitle?: string | undefined;
  badge_text?: string | undefined;
  icon_name?: string | undefined;
  content_markdown: string;
  sort_order?: number | undefined;
}

export interface UpdateHandbookArticlePayload {
  outlet_id?: string | undefined;
  category: string;
  title: string;
  subtitle?: string | undefined;
  badge_text?: string | undefined;
  icon_name?: string | undefined;
  content_markdown: string;
  sort_order?: number | undefined;
  is_active?: boolean | undefined;
}

export interface CreateSOPTemplateItemPayload {
  task_name: string;
  task_instruction?: string | undefined;
  requires_photo?: boolean | undefined;
  requires_numeric_input?: boolean | undefined;
  numeric_unit?: string | undefined;
  min_val?: number | null | undefined;
  max_val?: number | null | undefined;
  is_critical?: boolean | undefined;
}

export interface CreateSOPTemplatePayload {
  outlet_id?: string | undefined;
  code: string;
  title: string;
  station: StationType;
  shift_phase: ShiftPhaseType;
  description?: string | undefined;
  estimated_duration_minutes: number;
  items: CreateSOPTemplateItemPayload[];
}

export interface UpdateSOPTemplatePayload {
  title: string;
  station: StationType;
  shift_phase: ShiftPhaseType;
  description?: string | undefined;
  estimated_duration_minutes: number;
  is_active?: boolean | undefined;
}
