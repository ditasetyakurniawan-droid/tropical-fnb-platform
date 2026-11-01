// Package domain declares entities and interfaces for Daily SOP Checklists,
// Shift Quality Assurance, and Store Quality Audits.
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Station constants for F&B operations.
const (
	StationGrillSteak     = "GRILL_STEAK"
	StationDapurNusantara = "DAPUR_NUSANTARA"
	StationBarMinuman     = "BAR_MINUMAN"
	StationFOHGazebo      = "FOH_GAZEBO"
	StationKasirSafety    = "KASIR_SAFETY"
	StationCleaningTaman  = "CLEANING_TAMAN"
)

// ShiftPhase constants.
const (
	ShiftPhaseOpening  = "OPENING"
	ShiftPhaseHandover = "HANDOVER"
	ShiftPhaseClosing  = "CLOSING"
)

// RunStatus constants.
const (
	RunStatusInProgress   = "IN_PROGRESS"
	RunStatusCompleted    = "COMPLETED"
	RunStatusFlaggedIssue = "FLAGGED_ISSUE"
)

// OverallGrade constants.
const (
	GradeAExcellent        = "A_EXCELLENT"
	GradeBGood             = "B_GOOD"
	GradeCNeedsImprovement = "C_NEEDS_IMPROVEMENT"
	GradeDCritical         = "D_CRITICAL"
)

// SOPTemplate represents a master operational standard checklist.
type SOPTemplate struct {
	ID                       uuid.UUID         `json:"id"`
	TenantID                 uuid.UUID         `json:"tenant_id"`
	OutletID                 *uuid.UUID        `json:"outlet_id,omitempty"`
	Code                     string            `json:"code"`
	Title                    string            `json:"title"`
	Station                  string            `json:"station"`
	ShiftPhase               string            `json:"shift_phase"`
	Description              string            `json:"description,omitempty"`
	EstimatedDurationMinutes int               `json:"estimated_duration_minutes"`
	IsActive                 bool              `json:"is_active"`
	CreatedAt                time.Time         `json:"created_at"`
	UpdatedAt                time.Time         `json:"updated_at"`
	Items                    []SOPTemplateItem `json:"items,omitempty"`
}

// SOPTemplateItem represents an individual task within a template.
type SOPTemplateItem struct {
	ID                   uuid.UUID `json:"id"`
	TemplateID           uuid.UUID `json:"template_id"`
	SortOrder            int       `json:"sort_order"`
	TaskName             string    `json:"task_name"`
	TaskInstruction      string    `json:"task_instruction,omitempty"`
	RequiresPhoto        bool      `json:"requires_photo"`
	RequiresNumericInput bool      `json:"requires_numeric_input"`
	NumericUnit          *string   `json:"numeric_unit,omitempty"`
	MinVal               *float64  `json:"min_val,omitempty"`
	MaxVal               *float64  `json:"max_val,omitempty"`
	IsCritical           bool      `json:"is_critical"`
	CreatedAt            time.Time `json:"created_at"`
}

// SOPChecklistRun represents an execution of a checklist on a specific date/shift.
type SOPChecklistRun struct {
	ID               uuid.UUID                `json:"id"`
	TenantID         uuid.UUID                `json:"tenant_id"`
	OutletID         uuid.UUID                `json:"outlet_id"`
	OutletCode       string                   `json:"outlet_code,omitempty"`
	OutletName       string                   `json:"outlet_name,omitempty"`
	TemplateID       uuid.UUID                `json:"template_id"`
	TemplateCode     string                   `json:"template_code,omitempty"`
	TemplateTitle    string                   `json:"template_title,omitempty"`
	Station          string                   `json:"station,omitempty"`
	ShiftPhase       string                   `json:"shift_phase,omitempty"`
	RunDate          string                   `json:"run_date"` // YYYY-MM-DD
	ShiftName        string                   `json:"shift_name"`
	AssignedToUserID uuid.UUID                `json:"assigned_to_user_id"`
	AssignedToName   string                   `json:"assigned_to_name,omitempty"`
	SupervisorUserID *uuid.UUID               `json:"supervisor_user_id,omitempty"`
	SupervisorName   string                   `json:"supervisor_name,omitempty"`
	Status           string                   `json:"status"`
	StartedAt        time.Time                `json:"started_at"`
	CompletedAt      *time.Time               `json:"completed_at,omitempty"`
	TotalItems       int                      `json:"total_items"`
	CompletedItems   int                      `json:"completed_items"`
	FlaggedItems     int                      `json:"flagged_items"`
	SupervisorNotes  *string                  `json:"supervisor_notes,omitempty"`
	CreatedAt        time.Time                `json:"created_at"`
	UpdatedAt        time.Time                `json:"updated_at"`
	Records          []SOPChecklistItemRecord `json:"records,omitempty"`
}

// SOPChecklistItemRecord represents a recorded response for a task item.
type SOPChecklistItemRecord struct {
	ID                   uuid.UUID  `json:"id"`
	RunID                uuid.UUID  `json:"run_id"`
	TemplateItemID       uuid.UUID  `json:"template_item_id"`
	TaskName             string     `json:"task_name,omitempty"`
	TaskInstruction      string     `json:"task_instruction,omitempty"`
	RequiresPhoto        bool       `json:"requires_photo,omitempty"`
	RequiresNumericInput bool       `json:"requires_numeric_input,omitempty"`
	NumericUnit          *string    `json:"numeric_unit,omitempty"`
	MinVal               *float64   `json:"min_val,omitempty"`
	MaxVal               *float64   `json:"max_val,omitempty"`
	IsCritical           bool       `json:"is_critical,omitempty"`
	IsChecked            bool       `json:"is_checked"`
	NumericActualValue   *float64   `json:"numeric_actual_value,omitempty"`
	IsWithinRange        bool       `json:"is_within_range"`
	PhotoURL             *string    `json:"photo_url,omitempty"`
	Notes                *string    `json:"notes,omitempty"`
	Flagged              bool       `json:"flagged"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}

// QualityAudit represents a formal audit scorecard for store performance.
type QualityAudit struct {
	ID                   uuid.UUID         `json:"id"`
	TenantID             uuid.UUID         `json:"tenant_id"`
	OutletID             uuid.UUID         `json:"outlet_id"`
	OutletCode           string            `json:"outlet_code,omitempty"`
	OutletName           string            `json:"outlet_name,omitempty"`
	AuditNumber          string            `json:"audit_number"`
	AuditorUserID        uuid.UUID         `json:"auditor_user_id"`
	AuditorName          string            `json:"auditor_name,omitempty"`
	AuditDate            string            `json:"audit_date"` // YYYY-MM-DD
	AuditType            string            `json:"audit_type"`
	ScoreFoodQuality     float64           `json:"score_food_quality"`
	ScoreServiceSpeed    float64           `json:"score_service_speed"`
	ScoreCleanliness     float64           `json:"score_cleanliness"`
	ScoreSafetyEquipment float64           `json:"score_safety_equipment"`
	TotalWeightedScore   float64           `json:"total_weighted_score"`
	OverallGrade         string            `json:"overall_grade"`
	SummaryNotes         *string           `json:"summary_notes,omitempty"`
	ActionItems          []AuditActionItem `json:"action_items,omitempty"`
	CreatedAt            time.Time         `json:"created_at"`
	UpdatedAt            time.Time         `json:"updated_at"`
}

// AuditActionItem represents a corrective action derived from an audit.
type AuditActionItem struct {
	ID               uuid.UUID  `json:"id"`
	AuditID          uuid.UUID  `json:"audit_id"`
	Area             string     `json:"area"`
	IssueDescription string     `json:"issue_description"`
	Severity         string     `json:"severity"` // LOW, MEDIUM, HIGH, CRITICAL
	CorrectiveAction string     `json:"corrective_action"`
	AssignedToRole   string     `json:"assigned_to_role"`
	DueDate          string     `json:"due_date"` // YYYY-MM-DD
	Status           string     `json:"status"`   // OPEN, IN_PROGRESS, RESOLVED
	ResolutionNotes  *string    `json:"resolution_notes,omitempty"`
	ResolvedAt       *time.Time `json:"resolved_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// SOPHandbookArticle represents a digital operational handbook article or recipe/safety standard.
type SOPHandbookArticle struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        uuid.UUID  `json:"tenant_id"`
	OutletID        *uuid.UUID `json:"outlet_id,omitempty"`
	Category        string     `json:"category"`
	Title           string     `json:"title"`
	Subtitle        string     `json:"subtitle"`
	BadgeText       string     `json:"badge_text"`
	IconName        string     `json:"icon_name"`
	ContentMarkdown string     `json:"content_markdown"`
	SortOrder       int        `json:"sort_order"`
	IsActive        bool       `json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type CreateHandbookArticleRequest struct {
	OutletID        *uuid.UUID `json:"outlet_id,omitempty"`
	Category        string     `json:"category"`
	Title           string     `json:"title"`
	Subtitle        string     `json:"subtitle"`
	BadgeText       string     `json:"badge_text"`
	IconName        string     `json:"icon_name"`
	ContentMarkdown string     `json:"content_markdown"`
	SortOrder       int        `json:"sort_order"`
}

type UpdateHandbookArticleRequest struct {
	OutletID        *uuid.UUID `json:"outlet_id,omitempty"`
	Category        string     `json:"category"`
	Title           string     `json:"title"`
	Subtitle        string     `json:"subtitle"`
	BadgeText       string     `json:"badge_text"`
	IconName        string     `json:"icon_name"`
	ContentMarkdown string     `json:"content_markdown"`
	SortOrder       int        `json:"sort_order"`
	IsActive        *bool      `json:"is_active,omitempty"`
}

type CreateSOPTemplateRequest struct {
	OutletID                 *uuid.UUID                   `json:"outlet_id,omitempty"`
	Code                     string                       `json:"code"`
	Title                    string                       `json:"title"`
	Station                  string                       `json:"station"`
	ShiftPhase               string                       `json:"shift_phase"`
	Description              string                       `json:"description"`
	EstimatedDurationMinutes int                          `json:"estimated_duration_minutes"`
	Items                    []CreateSOPTemplateItemInput `json:"items"`
}

type CreateSOPTemplateItemInput struct {
	SortOrder            int      `json:"sort_order"`
	TaskName             string   `json:"task_name"`
	TaskInstruction      string   `json:"task_instruction"`
	RequiresPhoto        bool     `json:"requires_photo"`
	RequiresNumericInput bool     `json:"requires_numeric_input"`
	NumericUnit          *string  `json:"numeric_unit,omitempty"`
	MinVal               *float64 `json:"min_val,omitempty"`
	MaxVal               *float64 `json:"max_val,omitempty"`
	IsCritical           bool     `json:"is_critical"`
}

type UpdateSOPTemplateRequest struct {
	Title                    string                       `json:"title"`
	Station                  string                       `json:"station"`
	ShiftPhase               string                       `json:"shift_phase"`
	Description              string                       `json:"description"`
	EstimatedDurationMinutes int                          `json:"estimated_duration_minutes"`
	Items                    []CreateSOPTemplateItemInput `json:"items,omitempty"`
}

// DTOs
type CreateChecklistRunRequest struct {
	OutletID   uuid.UUID `json:"outlet_id"`
	TemplateID uuid.UUID `json:"template_id"`
	ShiftName  string    `json:"shift_name"`
}

type UpdateChecklistItemRequest struct {
	IsChecked          bool     `json:"is_checked"`
	NumericActualValue *float64 `json:"numeric_actual_value,omitempty"`
	PhotoURL           *string  `json:"photo_url,omitempty"`
	Notes              *string  `json:"notes,omitempty"`
}

type CompleteChecklistRunRequest struct {
	SupervisorNotes string `json:"supervisor_notes"`
}

type CreateQualityAuditRequest struct {
	OutletID             uuid.UUID               `json:"outlet_id"`
	AuditType            string                  `json:"audit_type"`
	ScoreFoodQuality     float64                 `json:"score_food_quality"`
	ScoreServiceSpeed    float64                 `json:"score_service_speed"`
	ScoreCleanliness     float64                 `json:"score_cleanliness"`
	ScoreSafetyEquipment float64                 `json:"score_safety_equipment"`
	SummaryNotes         string                  `json:"summary_notes"`
	ActionItems          []CreateActionItemInput `json:"action_items,omitempty"`
}

type CreateActionItemInput struct {
	Area             string `json:"area"`
	IssueDescription string `json:"issue_description"`
	Severity         string `json:"severity"`
	CorrectiveAction string `json:"corrective_action"`
	AssignedToRole   string `json:"assigned_to_role"`
	DueDate          string `json:"due_date"`
}

type UpdateActionItemStatusRequest struct {
	Status          string `json:"status"` // OPEN, IN_PROGRESS, RESOLVED
	ResolutionNotes string `json:"resolution_notes"`
}

// SOPRepository defines database operations for the SOP module.
type SOPRepository interface {
	ListTemplates(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station, shiftPhase string) ([]SOPTemplate, error)
	GetTemplate(ctx context.Context, tenantID, templateID uuid.UUID) (*SOPTemplate, error)
	CreateTemplate(ctx context.Context, tmpl *SOPTemplate) (*SOPTemplate, error)
	UpdateTemplate(ctx context.Context, tmpl *SOPTemplate) (*SOPTemplate, error)
	DeleteTemplate(ctx context.Context, tenantID, templateID uuid.UUID) error

	ListChecklistRuns(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date string, status string) ([]SOPChecklistRun, error)
	GetChecklistRun(ctx context.Context, tenantID, runID uuid.UUID) (*SOPChecklistRun, error)
	CreateChecklistRun(ctx context.Context, tenantID, outletID, templateID, assignedToUserID uuid.UUID, shiftName string) (*SOPChecklistRun, error)
	UpdateChecklistItem(ctx context.Context, tenantID, runID, recordID uuid.UUID, isChecked bool, numericVal *float64, photoURL, notes *string) (*SOPChecklistItemRecord, error)
	CompleteChecklistRun(ctx context.Context, tenantID, runID, supervisorUserID uuid.UUID, notes string) (*SOPChecklistRun, error)

	ListQualityAudits(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]QualityAudit, error)
	GetQualityAudit(ctx context.Context, tenantID, auditID uuid.UUID) (*QualityAudit, error)
	CreateQualityAudit(ctx context.Context, audit *QualityAudit) (*QualityAudit, error)
	UpdateActionItemStatus(ctx context.Context, tenantID, actionItemID uuid.UUID, status, resolutionNotes string) (*AuditActionItem, error)

	ListHandbookArticles(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, category string) ([]SOPHandbookArticle, error)
	GetHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) (*SOPHandbookArticle, error)
	CreateHandbookArticle(ctx context.Context, article *SOPHandbookArticle) (*SOPHandbookArticle, error)
	UpdateHandbookArticle(ctx context.Context, article *SOPHandbookArticle) (*SOPHandbookArticle, error)
	DeleteHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) error

	GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error)
}
