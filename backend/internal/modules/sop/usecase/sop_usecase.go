// Package usecase implements the business logic orchestration for SOP and Quality Audits.
package usecase

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"tropical-fnb/backend/internal/modules/sop/domain"
)

type SOPUsecase struct {
	repo domain.SOPRepository
}

func NewSOPUsecase(repo domain.SOPRepository) *SOPUsecase {
	return &SOPUsecase{repo: repo}
}

func (u *SOPUsecase) ListTemplates(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station, shiftPhase string) ([]domain.SOPTemplate, error) {
	return u.repo.ListTemplates(ctx, tenantID, outletID, station, shiftPhase)
}

func (u *SOPUsecase) GetTemplate(ctx context.Context, tenantID, templateID uuid.UUID) (*domain.SOPTemplate, error) {
	return u.repo.GetTemplate(ctx, tenantID, templateID)
}

func (u *SOPUsecase) ListChecklistRuns(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date string, status string) ([]domain.SOPChecklistRun, error) {
	return u.repo.ListChecklistRuns(ctx, tenantID, outletID, date, status)
}

func (u *SOPUsecase) GetChecklistRun(ctx context.Context, tenantID, runID uuid.UUID) (*domain.SOPChecklistRun, error) {
	return u.repo.GetChecklistRun(ctx, tenantID, runID)
}

func (u *SOPUsecase) CreateChecklistRun(ctx context.Context, tenantID, userID uuid.UUID, req domain.CreateChecklistRunRequest) (*domain.SOPChecklistRun, error) {
	if req.OutletID == uuid.Nil {
		return nil, fmt.Errorf("outlet_id is required")
	}
	if req.TemplateID == uuid.Nil {
		return nil, fmt.Errorf("template_id is required")
	}
	if req.ShiftName == "" {
		req.ShiftName = "SHIFT_PAGI"
	}

	return u.repo.CreateChecklistRun(ctx, tenantID, req.OutletID, req.TemplateID, userID, req.ShiftName)
}

func (u *SOPUsecase) UpdateChecklistItem(ctx context.Context, tenantID, runID, recordID uuid.UUID, req domain.UpdateChecklistItemRequest) (*domain.SOPChecklistItemRecord, error) {
	return u.repo.UpdateChecklistItem(ctx, tenantID, runID, recordID, req.IsChecked, req.NumericActualValue, req.PhotoURL, req.Notes)
}

func (u *SOPUsecase) CompleteChecklistRun(ctx context.Context, tenantID, runID, supervisorUserID uuid.UUID, req domain.CompleteChecklistRunRequest) (*domain.SOPChecklistRun, error) {
	return u.repo.CompleteChecklistRun(ctx, tenantID, runID, supervisorUserID, req.SupervisorNotes)
}

func (u *SOPUsecase) ListQualityAudits(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.QualityAudit, error) {
	return u.repo.ListQualityAudits(ctx, tenantID, outletID)
}

func (u *SOPUsecase) GetQualityAudit(ctx context.Context, tenantID, auditID uuid.UUID) (*domain.QualityAudit, error) {
	return u.repo.GetQualityAudit(ctx, tenantID, auditID)
}

func (u *SOPUsecase) CreateQualityAudit(ctx context.Context, tenantID, auditorUserID uuid.UUID, req domain.CreateQualityAuditRequest) (*domain.QualityAudit, error) {
	if req.OutletID == uuid.Nil {
		return nil, fmt.Errorf("outlet_id is required")
	}
	if req.ScoreFoodQuality < 0 || req.ScoreFoodQuality > 100 {
		return nil, fmt.Errorf("score_food_quality must be between 0 and 100")
	}
	if req.ScoreServiceSpeed < 0 || req.ScoreServiceSpeed > 100 {
		return nil, fmt.Errorf("score_service_speed must be between 0 and 100")
	}
	if req.ScoreCleanliness < 0 || req.ScoreCleanliness > 100 {
		return nil, fmt.Errorf("score_cleanliness must be between 0 and 100")
	}
	if req.ScoreSafetyEquipment < 0 || req.ScoreSafetyEquipment > 100 {
		return nil, fmt.Errorf("score_safety_equipment must be between 0 and 100")
	}

	var actionItems []domain.AuditActionItem
	for _, act := range req.ActionItems {
		if act.Area == "" || act.IssueDescription == "" || act.CorrectiveAction == "" {
			return nil, fmt.Errorf("action item requires area, issue_description, and corrective_action")
		}
		if act.Severity == "" {
			act.Severity = "MEDIUM"
		}
		if act.AssignedToRole == "" {
			act.AssignedToRole = "STORE_MANAGER"
		}
		actionItems = append(actionItems, domain.AuditActionItem{
			Area:             act.Area,
			IssueDescription: act.IssueDescription,
			Severity:         act.Severity,
			CorrectiveAction: act.CorrectiveAction,
			AssignedToRole:   act.AssignedToRole,
			DueDate:          act.DueDate,
		})
	}

	audit := &domain.QualityAudit{
		TenantID:             tenantID,
		OutletID:             req.OutletID,
		AuditorUserID:        auditorUserID,
		AuditType:            req.AuditType,
		ScoreFoodQuality:     req.ScoreFoodQuality,
		ScoreServiceSpeed:    req.ScoreServiceSpeed,
		ScoreCleanliness:     req.ScoreCleanliness,
		ScoreSafetyEquipment: req.ScoreSafetyEquipment,
		SummaryNotes:         &req.SummaryNotes,
		ActionItems:          actionItems,
	}

	return u.repo.CreateQualityAudit(ctx, audit)
}

func (u *SOPUsecase) UpdateActionItemStatus(ctx context.Context, tenantID, actionItemID uuid.UUID, req domain.UpdateActionItemStatusRequest) (*domain.AuditActionItem, error) {
	if req.Status != "OPEN" && req.Status != "IN_PROGRESS" && req.Status != "RESOLVED" {
		return nil, fmt.Errorf("invalid action item status: %s", req.Status)
	}
	return u.repo.UpdateActionItemStatus(ctx, tenantID, actionItemID, req.Status, req.ResolutionNotes)
}

func (u *SOPUsecase) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	return u.repo.GetUserIDByUsername(ctx, tenantID, username)
}

func (u *SOPUsecase) CreateTemplate(ctx context.Context, tenantID uuid.UUID, req domain.CreateSOPTemplateRequest) (*domain.SOPTemplate, error) {
	if req.Code == "" || req.Title == "" {
		return nil, fmt.Errorf("code and title are required")
	}
	if req.Station == "" {
		req.Station = domain.StationGrillSteak
	}
	if req.ShiftPhase == "" {
		req.ShiftPhase = domain.ShiftPhaseOpening
	}
	if req.EstimatedDurationMinutes <= 0 {
		req.EstimatedDurationMinutes = 15
	}

	tmpl := &domain.SOPTemplate{
		TenantID:                 tenantID,
		OutletID:                 req.OutletID,
		Code:                     req.Code,
		Title:                    req.Title,
		Station:                  req.Station,
		ShiftPhase:               req.ShiftPhase,
		Description:              req.Description,
		EstimatedDurationMinutes: req.EstimatedDurationMinutes,
	}

	for i, item := range req.Items {
		if item.TaskName == "" {
			return nil, fmt.Errorf("item task_name is required")
		}
		sortOrder := item.SortOrder
		if sortOrder == 0 {
			sortOrder = i + 1
		}
		tmpl.Items = append(tmpl.Items, domain.SOPTemplateItem{
			SortOrder:            sortOrder,
			TaskName:             item.TaskName,
			TaskInstruction:      item.TaskInstruction,
			RequiresPhoto:        item.RequiresPhoto,
			RequiresNumericInput: item.RequiresNumericInput,
			NumericUnit:          item.NumericUnit,
			MinVal:               item.MinVal,
			MaxVal:               item.MaxVal,
			IsCritical:           item.IsCritical,
		})
	}

	return u.repo.CreateTemplate(ctx, tmpl)
}

func (u *SOPUsecase) UpdateTemplate(ctx context.Context, tenantID, templateID uuid.UUID, req domain.UpdateSOPTemplateRequest) (*domain.SOPTemplate, error) {
	tmpl := &domain.SOPTemplate{
		ID:                       templateID,
		TenantID:                 tenantID,
		Title:                    req.Title,
		Station:                  req.Station,
		ShiftPhase:               req.ShiftPhase,
		Description:              req.Description,
		EstimatedDurationMinutes: req.EstimatedDurationMinutes,
	}
	for i, item := range req.Items {
		sortOrder := item.SortOrder
		if sortOrder == 0 {
			sortOrder = i + 1
		}
		tmpl.Items = append(tmpl.Items, domain.SOPTemplateItem{
			SortOrder:            sortOrder,
			TaskName:             item.TaskName,
			TaskInstruction:      item.TaskInstruction,
			RequiresPhoto:        item.RequiresPhoto,
			RequiresNumericInput: item.RequiresNumericInput,
			NumericUnit:          item.NumericUnit,
			MinVal:               item.MinVal,
			MaxVal:               item.MaxVal,
			IsCritical:           item.IsCritical,
		})
	}
	return u.repo.UpdateTemplate(ctx, tmpl)
}

func (u *SOPUsecase) DeleteTemplate(ctx context.Context, tenantID, templateID uuid.UUID) error {
	return u.repo.DeleteTemplate(ctx, tenantID, templateID)
}

func (u *SOPUsecase) ListHandbookArticles(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, category string) ([]domain.SOPHandbookArticle, error) {
	return u.repo.ListHandbookArticles(ctx, tenantID, outletID, category)
}

func (u *SOPUsecase) GetHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) (*domain.SOPHandbookArticle, error) {
	return u.repo.GetHandbookArticle(ctx, tenantID, articleID)
}

func (u *SOPUsecase) CreateHandbookArticle(ctx context.Context, tenantID uuid.UUID, req domain.CreateHandbookArticleRequest) (*domain.SOPHandbookArticle, error) {
	if req.Title == "" || req.ContentMarkdown == "" {
		return nil, fmt.Errorf("title and content are required")
	}
	if req.Category == "" {
		req.Category = "GENERAL_SERVICE"
	}
	if req.BadgeText == "" {
		req.BadgeText = "STANDAR RESTO"
	}
	if req.IconName == "" {
		req.IconName = "BookOpen"
	}

	article := &domain.SOPHandbookArticle{
		TenantID:        tenantID,
		OutletID:        req.OutletID,
		Category:        req.Category,
		Title:           req.Title,
		Subtitle:        req.Subtitle,
		BadgeText:       req.BadgeText,
		IconName:        req.IconName,
		ContentMarkdown: req.ContentMarkdown,
		SortOrder:       req.SortOrder,
	}

	return u.repo.CreateHandbookArticle(ctx, article)
}

func (u *SOPUsecase) UpdateHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID, req domain.UpdateHandbookArticleRequest) (*domain.SOPHandbookArticle, error) {
	article := &domain.SOPHandbookArticle{
		ID:              articleID,
		TenantID:        tenantID,
		OutletID:        req.OutletID,
		Category:        req.Category,
		Title:           req.Title,
		Subtitle:        req.Subtitle,
		BadgeText:       req.BadgeText,
		IconName:        req.IconName,
		ContentMarkdown: req.ContentMarkdown,
		SortOrder:       req.SortOrder,
	}
	return u.repo.UpdateHandbookArticle(ctx, article)
}

func (u *SOPUsecase) DeleteHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) error {
	return u.repo.DeleteHandbookArticle(ctx, tenantID, articleID)
}
