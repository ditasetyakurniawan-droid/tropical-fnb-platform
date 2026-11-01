// Package repository implements the database persistence for SOP checklists and Quality Audits.
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"tropical-fnb/backend/internal/modules/sop/domain"
	"tropical-fnb/backend/internal/platform/database"
)

type PostgresSOPRepository struct {
	txMgr *database.TxManager
}

func NewSOPRepository(txMgr *database.TxManager) *PostgresSOPRepository {
	return &PostgresSOPRepository{txMgr: txMgr}
}

// ListTemplates fetches operational SOP templates.
func (r *PostgresSOPRepository) ListTemplates(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station, shiftPhase string) ([]domain.SOPTemplate, error) {
	query := `
		SELECT 
			id, tenant_id, outlet_id, code, title, station, shift_phase, 
			COALESCE(description, ''), estimated_duration_minutes, is_active, 
			created_at, updated_at
		FROM sop_templates
		WHERE tenant_id = $1 AND is_active = true
	`
	args := []any{tenantID}
	argIdx := 2

	if outletID != nil {
		query += fmt.Sprintf(" AND (outlet_id IS NULL OR outlet_id = $%d)", argIdx)
		args = append(args, *outletID)
		argIdx++
	}
	if station != "" {
		query += fmt.Sprintf(" AND station = $%d", argIdx)
		args = append(args, station)
		argIdx++
	}
	if shiftPhase != "" {
		query += fmt.Sprintf(" AND shift_phase = $%d", argIdx)
		args = append(args, shiftPhase)
		argIdx++
	}

	query += " ORDER BY station, shift_phase, code"

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list sop templates: %w", err)
	}
	defer rows.Close()

	templates := make([]domain.SOPTemplate, 0)
	for rows.Next() {
		var t domain.SOPTemplate
		t.Items = make([]domain.SOPTemplateItem, 0)
		if err := rows.Scan(
			&t.ID, &t.TenantID, &t.OutletID, &t.Code, &t.Title, &t.Station, &t.ShiftPhase,
			&t.Description, &t.EstimatedDurationMinutes, &t.IsActive,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan sop template: %w", err)
		}
		templates = append(templates, t)
	}

	// Fetch items for each template
	for i := range templates {
		itemsQuery := `
			SELECT 
				id, template_id, sort_order, task_name, COALESCE(task_instruction, ''),
				requires_photo, requires_numeric_input, numeric_unit, min_val, max_val,
				is_critical, created_at
			FROM sop_template_items
			WHERE template_id = $1
			ORDER BY sort_order, created_at
		`
		iRows, err := r.txMgr.Conn(ctx).Query(ctx, itemsQuery, templates[i].ID)
		if err != nil {
			return nil, fmt.Errorf("list template items: %w", err)
		}
		for iRows.Next() {
			var it domain.SOPTemplateItem
			if err := iRows.Scan(
				&it.ID, &it.TemplateID, &it.SortOrder, &it.TaskName, &it.TaskInstruction,
				&it.RequiresPhoto, &it.RequiresNumericInput, &it.NumericUnit, &it.MinVal, &it.MaxVal,
				&it.IsCritical, &it.CreatedAt,
			); err != nil {
				iRows.Close()
				return nil, fmt.Errorf("scan template item: %w", err)
			}
			templates[i].Items = append(templates[i].Items, it)
		}
		iRows.Close()
	}

	return templates, nil
}

// GetTemplate fetches a single template by ID.
func (r *PostgresSOPRepository) GetTemplate(ctx context.Context, tenantID, templateID uuid.UUID) (*domain.SOPTemplate, error) {
	query := `
		SELECT 
			id, tenant_id, outlet_id, code, title, station, shift_phase, 
			COALESCE(description, ''), estimated_duration_minutes, is_active, 
			created_at, updated_at
		FROM sop_templates
		WHERE tenant_id = $1 AND id = $2
	`
	var t domain.SOPTemplate
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, templateID).Scan(
		&t.ID, &t.TenantID, &t.OutletID, &t.Code, &t.Title, &t.Station, &t.ShiftPhase,
		&t.Description, &t.EstimatedDurationMinutes, &t.IsActive,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get sop template: %w", err)
	}

	itemsQuery := `
		SELECT 
			id, template_id, sort_order, task_name, COALESCE(task_instruction, ''),
			requires_photo, requires_numeric_input, numeric_unit, min_val, max_val,
			is_critical, created_at
		FROM sop_template_items
		WHERE template_id = $1
		ORDER BY sort_order, created_at
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, itemsQuery, t.ID)
	if err != nil {
		return nil, fmt.Errorf("list template items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var it domain.SOPTemplateItem
		if err := rows.Scan(
			&it.ID, &it.TemplateID, &it.SortOrder, &it.TaskName, &it.TaskInstruction,
			&it.RequiresPhoto, &it.RequiresNumericInput, &it.NumericUnit, &it.MinVal, &it.MaxVal,
			&it.IsCritical, &it.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan template item: %w", err)
		}
		t.Items = append(t.Items, it)
	}

	return &t, nil
}

// ListChecklistRuns fetches runs filtered by date and status.
func (r *PostgresSOPRepository) ListChecklistRuns(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date string, status string) ([]domain.SOPChecklistRun, error) {
	query := `
		SELECT 
			r.id, r.tenant_id, r.outlet_id, o.code, o.name,
			r.template_id, t.code, t.title, t.station, t.shift_phase,
			r.run_date::text, r.shift_name,
			r.assigned_to_user_id, COALESCE(u1.full_name, ''),
			r.supervisor_user_id, COALESCE(u2.full_name, ''),
			r.status, r.started_at, r.completed_at,
			r.total_items, r.completed_items, r.flagged_items,
			r.supervisor_notes, r.created_at, r.updated_at
		FROM sop_checklist_runs r
		JOIN outlets o ON r.outlet_id = o.id
		JOIN sop_templates t ON r.template_id = t.id
		JOIN users u1 ON r.assigned_to_user_id = u1.id
		LEFT JOIN users u2 ON r.supervisor_user_id = u2.id
		WHERE r.tenant_id = $1
	`
	args := []any{tenantID}
	argIdx := 2

	if outletID != nil {
		query += fmt.Sprintf(" AND r.outlet_id = $%d", argIdx)
		args = append(args, *outletID)
		argIdx++
	}
	if date != "" {
		query += fmt.Sprintf(" AND r.run_date = $%d::date", argIdx)
		args = append(args, date)
		argIdx++
	}
	if status != "" {
		query += fmt.Sprintf(" AND r.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	query += " ORDER BY r.run_date DESC, r.started_at DESC"

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list checklist runs: %w", err)
	}
	defer rows.Close()

	runs := make([]domain.SOPChecklistRun, 0)
	for rows.Next() {
		var run domain.SOPChecklistRun
		if err := rows.Scan(
			&run.ID, &run.TenantID, &run.OutletID, &run.OutletCode, &run.OutletName,
			&run.TemplateID, &run.TemplateCode, &run.TemplateTitle, &run.Station, &run.ShiftPhase,
			&run.RunDate, &run.ShiftName,
			&run.AssignedToUserID, &run.AssignedToName,
			&run.SupervisorUserID, &run.SupervisorName,
			&run.Status, &run.StartedAt, &run.CompletedAt,
			&run.TotalItems, &run.CompletedItems, &run.FlaggedItems,
			&run.SupervisorNotes, &run.CreatedAt, &run.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan checklist run: %w", err)
		}
		runs = append(runs, run)
	}

	return runs, nil
}

// GetChecklistRun fetches a specific run with all its checklist records.
func (r *PostgresSOPRepository) GetChecklistRun(ctx context.Context, tenantID, runID uuid.UUID) (*domain.SOPChecklistRun, error) {
	query := `
		SELECT 
			r.id, r.tenant_id, r.outlet_id, o.code, o.name,
			r.template_id, t.code, t.title, t.station, t.shift_phase,
			r.run_date::text, r.shift_name,
			r.assigned_to_user_id, COALESCE(u1.full_name, ''),
			r.supervisor_user_id, COALESCE(u2.full_name, ''),
			r.status, r.started_at, r.completed_at,
			r.total_items, r.completed_items, r.flagged_items,
			r.supervisor_notes, r.created_at, r.updated_at
		FROM sop_checklist_runs r
		JOIN outlets o ON r.outlet_id = o.id
		JOIN sop_templates t ON r.template_id = t.id
		JOIN users u1 ON r.assigned_to_user_id = u1.id
		LEFT JOIN users u2 ON r.supervisor_user_id = u2.id
		WHERE r.tenant_id = $1 AND r.id = $2
	`
	var run domain.SOPChecklistRun
	run.Records = make([]domain.SOPChecklistItemRecord, 0)
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, runID).Scan(
		&run.ID, &run.TenantID, &run.OutletID, &run.OutletCode, &run.OutletName,
		&run.TemplateID, &run.TemplateCode, &run.TemplateTitle, &run.Station, &run.ShiftPhase,
		&run.RunDate, &run.ShiftName,
		&run.AssignedToUserID, &run.AssignedToName,
		&run.SupervisorUserID, &run.SupervisorName,
		&run.Status, &run.StartedAt, &run.CompletedAt,
		&run.TotalItems, &run.CompletedItems, &run.FlaggedItems,
		&run.SupervisorNotes, &run.CreatedAt, &run.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get checklist run: %w", err)
	}

	recordsQuery := `
		SELECT 
			rec.id, rec.run_id, rec.template_item_id,
			ti.task_name, COALESCE(ti.task_instruction, ''),
			ti.requires_photo, ti.requires_numeric_input, ti.numeric_unit, ti.min_val, ti.max_val, ti.is_critical,
			rec.is_checked, rec.numeric_actual_value, rec.is_within_range,
			rec.photo_url, rec.notes, rec.flagged, rec.completed_at, rec.created_at
		FROM sop_checklist_item_records rec
		JOIN sop_template_items ti ON rec.template_item_id = ti.id
		WHERE rec.run_id = $1
		ORDER BY ti.sort_order, rec.created_at
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, recordsQuery, run.ID)
	if err != nil {
		return nil, fmt.Errorf("list run records: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var rec domain.SOPChecklistItemRecord
		if err := rows.Scan(
			&rec.ID, &rec.RunID, &rec.TemplateItemID,
			&rec.TaskName, &rec.TaskInstruction,
			&rec.RequiresPhoto, &rec.RequiresNumericInput, &rec.NumericUnit, &rec.MinVal, &rec.MaxVal, &rec.IsCritical,
			&rec.IsChecked, &rec.NumericActualValue, &rec.IsWithinRange,
			&rec.PhotoURL, &rec.Notes, &rec.Flagged, &rec.CompletedAt, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan run record: %w", err)
		}
		run.Records = append(run.Records, rec)
	}

	return &run, nil
}

// CreateChecklistRun creates a new run and copies items from the master template.
func (r *PostgresSOPRepository) CreateChecklistRun(ctx context.Context, tenantID, outletID, templateID, assignedToUserID uuid.UUID, shiftName string) (*domain.SOPChecklistRun, error) {
	var run domain.SOPChecklistRun

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Fetch template items
		itemsQuery := `
			SELECT id FROM sop_template_items
			WHERE template_id = $1
			ORDER BY sort_order, created_at
		`
		rows, err := r.txMgr.Conn(txCtx).Query(txCtx, itemsQuery, templateID)
		if err != nil {
			return fmt.Errorf("fetch template items: %w", err)
		}
		var itemIDs []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			itemIDs = append(itemIDs, id)
		}
		rows.Close()

		if len(itemIDs) == 0 {
			return fmt.Errorf("cannot start run: template has no items")
		}

		// 2. Insert run
		insertRunQuery := `
			INSERT INTO sop_checklist_runs (
				tenant_id, outlet_id, template_id, run_date, shift_name,
				assigned_to_user_id, status, started_at, total_items, completed_items, flagged_items
			) VALUES (
				$1, $2, $3, CURRENT_DATE, $4,
				$5, 'IN_PROGRESS', now(), $6, 0, 0
			) RETURNING id, created_at, updated_at
		`
		err = r.txMgr.Conn(txCtx).QueryRow(
			txCtx, insertRunQuery,
			tenantID, outletID, templateID, shiftName, assignedToUserID, len(itemIDs),
		).Scan(&run.ID, &run.CreatedAt, &run.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert checklist run: %w", err)
		}

		// 3. Insert record for each item
		for _, itemID := range itemIDs {
			insertRecordQuery := `
				INSERT INTO sop_checklist_item_records (
					run_id, template_item_id, is_checked, is_within_range, flagged
				) VALUES ($1, $2, false, true, false)
			`
			if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, insertRecordQuery, run.ID, itemID); err != nil {
				return fmt.Errorf("insert item record: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return r.GetChecklistRun(ctx, tenantID, run.ID)
}

// UpdateChecklistItem records an item's completion, checks numeric bounds, and recalculates run stats.
func (r *PostgresSOPRepository) UpdateChecklistItem(ctx context.Context, tenantID, runID, recordID uuid.UUID, isChecked bool, numericVal *float64, photoURL, notes *string) (*domain.SOPChecklistItemRecord, error) {
	var rec domain.SOPChecklistItemRecord

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Fetch template item bounds
		boundQuery := `
			SELECT ti.requires_numeric_input, ti.min_val, ti.max_val, ti.is_critical
			FROM sop_checklist_item_records rec
			JOIN sop_template_items ti ON rec.template_item_id = ti.id
			JOIN sop_checklist_runs r ON rec.run_id = r.id
			WHERE r.tenant_id = $1 AND rec.run_id = $2 AND rec.id = $3
		`
		var reqNum, isCrit bool
		var minVal, maxVal *float64
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, boundQuery, tenantID, runID, recordID).Scan(&reqNum, &minVal, &maxVal, &isCrit)
		if err != nil {
			return fmt.Errorf("find checklist item record: %w", err)
		}

		isWithinRange := true
		flagged := false

		if reqNum && numericVal != nil {
			if minVal != nil && *numericVal < *minVal {
				isWithinRange = false
				flagged = true
			}
			if maxVal != nil && *numericVal > *maxVal {
				isWithinRange = false
				flagged = true
			}
		}

		var completedAt *time.Time
		if isChecked {
			now := time.Now()
			completedAt = &now
		}

		// 2. Update record
		updateRecQuery := `
			UPDATE sop_checklist_item_records
			SET 
				is_checked = $1,
				numeric_actual_value = $2,
				is_within_range = $3,
				photo_url = $4,
				notes = $5,
				flagged = $6,
				completed_at = $7
			WHERE id = $8 AND run_id = $9
			RETURNING id, run_id, template_item_id, is_checked, numeric_actual_value, is_within_range, photo_url, notes, flagged, completed_at, created_at
		`
		err = r.txMgr.Conn(txCtx).QueryRow(
			txCtx, updateRecQuery,
			isChecked, numericVal, isWithinRange, photoURL, notes, flagged, completedAt, recordID, runID,
		).Scan(
			&rec.ID, &rec.RunID, &rec.TemplateItemID, &rec.IsChecked, &rec.NumericActualValue, &rec.IsWithinRange,
			&rec.PhotoURL, &rec.Notes, &rec.Flagged, &rec.CompletedAt, &rec.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("update record: %w", err)
		}

		// 3. Recalculate run counts
		countQuery := `
			SELECT 
				COUNT(*) as total,
				COUNT(*) FILTER (WHERE is_checked = true) as completed,
				COUNT(*) FILTER (WHERE flagged = true) as flagged
			FROM sop_checklist_item_records
			WHERE run_id = $1
		`
		var total, completed, totalFlagged int
		err = r.txMgr.Conn(txCtx).QueryRow(txCtx, countQuery, runID).Scan(&total, &completed, &totalFlagged)
		if err != nil {
			return fmt.Errorf("count run stats: %w", err)
		}

		updateRunQuery := `
			UPDATE sop_checklist_runs
			SET total_items = $1, completed_items = $2, flagged_items = $3
			WHERE id = $4
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, updateRunQuery, total, completed, totalFlagged, runID); err != nil {
			return fmt.Errorf("update run counts: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &rec, nil
}

// CompleteChecklistRun marks the run as completed or flagged issue.
func (r *PostgresSOPRepository) CompleteChecklistRun(ctx context.Context, tenantID, runID, supervisorUserID uuid.UUID, notes string) (*domain.SOPChecklistRun, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var flaggedItems int
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT flagged_items FROM sop_checklist_runs WHERE tenant_id = $1 AND id = $2`, tenantID, runID).Scan(&flaggedItems)
		if err != nil {
			return fmt.Errorf("find run: %w", err)
		}

		status := domain.RunStatusCompleted
		if flaggedItems > 0 {
			status = domain.RunStatusFlaggedIssue
		}

		updateQuery := `
			UPDATE sop_checklist_runs
			SET 
				status = $1,
				supervisor_user_id = $2,
				supervisor_notes = $3,
				completed_at = now()
			WHERE tenant_id = $4 AND id = $5
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, updateQuery, status, supervisorUserID, notes, tenantID, runID); err != nil {
			return fmt.Errorf("complete checklist run: %w", err)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return r.GetChecklistRun(ctx, tenantID, runID)
}

// ListQualityAudits fetches audit scorecards with action items.
func (r *PostgresSOPRepository) ListQualityAudits(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.QualityAudit, error) {
	query := `
		SELECT 
			a.id, a.tenant_id, a.outlet_id, o.code, o.name,
			a.audit_number, a.auditor_user_id, u.full_name,
			a.audit_date::text, a.audit_type,
			a.score_food_quality, a.score_service_speed, a.score_cleanliness, a.score_safety_equipment,
			a.total_weighted_score, a.overall_grade, a.summary_notes,
			a.created_at, a.updated_at
		FROM quality_audits a
		JOIN outlets o ON a.outlet_id = o.id
		JOIN users u ON a.auditor_user_id = u.id
		WHERE a.tenant_id = $1
	`
	args := []any{tenantID}
	if outletID != nil {
		query += " AND a.outlet_id = $2"
		args = append(args, *outletID)
	}
	query += " ORDER BY a.audit_date DESC, a.created_at DESC"

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list quality audits: %w", err)
	}
	defer rows.Close()

	audits := make([]domain.QualityAudit, 0)
	for rows.Next() {
		var a domain.QualityAudit
		a.ActionItems = make([]domain.AuditActionItem, 0)
		if err := rows.Scan(
			&a.ID, &a.TenantID, &a.OutletID, &a.OutletCode, &a.OutletName,
			&a.AuditNumber, &a.AuditorUserID, &a.AuditorName,
			&a.AuditDate, &a.AuditType,
			&a.ScoreFoodQuality, &a.ScoreServiceSpeed, &a.ScoreCleanliness, &a.ScoreSafetyEquipment,
			&a.TotalWeightedScore, &a.OverallGrade, &a.SummaryNotes,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan quality audit: %w", err)
		}
		audits = append(audits, a)
	}

	// Fetch action items
	for i := range audits {
		actQuery := `
			SELECT 
				id, audit_id, area, issue_description, severity,
				corrective_action, assigned_to_role, due_date::text,
				status, resolution_notes, resolved_at, created_at
			FROM audit_action_items
			WHERE audit_id = $1
			ORDER BY due_date ASC
		`
		actRows, err := r.txMgr.Conn(ctx).Query(ctx, actQuery, audits[i].ID)
		if err != nil {
			return nil, fmt.Errorf("list action items: %w", err)
		}
		for actRows.Next() {
			var act domain.AuditActionItem
			if err := actRows.Scan(
				&act.ID, &act.AuditID, &act.Area, &act.IssueDescription, &act.Severity,
				&act.CorrectiveAction, &act.AssignedToRole, &act.DueDate,
				&act.Status, &act.ResolutionNotes, &act.ResolvedAt, &act.CreatedAt,
			); err != nil {
				actRows.Close()
				return nil, fmt.Errorf("scan action item: %w", err)
			}
			audits[i].ActionItems = append(audits[i].ActionItems, act)
		}
		actRows.Close()
	}

	return audits, nil
}

// GetQualityAudit fetches a single quality audit.
func (r *PostgresSOPRepository) GetQualityAudit(ctx context.Context, tenantID, auditID uuid.UUID) (*domain.QualityAudit, error) {
	audits, err := r.ListQualityAudits(ctx, tenantID, nil)
	if err != nil {
		return nil, err
	}
	for _, a := range audits {
		if a.ID == auditID {
			return &a, nil
		}
	}
	return nil, fmt.Errorf("quality audit not found")
}

// CreateQualityAudit saves a new audit with calculated weighted scores and action items.
func (r *PostgresSOPRepository) CreateQualityAudit(ctx context.Context, audit *domain.QualityAudit) (*domain.QualityAudit, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Generate Audit Number
		dateCompact := time.Now().Format("20060102")
		var count int
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT COUNT(*) FROM quality_audits WHERE tenant_id = $1`, audit.TenantID).Scan(&count); err != nil {
			return fmt.Errorf("count audits: %w", err)
		}
		audit.AuditNumber = fmt.Sprintf("QAC-%s-%03d", dateCompact, count+1)

		// 2. Weighted Score Calculation: Food 30%, Speed 25%, Cleanliness 25%, Safety 20%
		audit.TotalWeightedScore = (0.30 * audit.ScoreFoodQuality) +
			(0.25 * audit.ScoreServiceSpeed) +
			(0.25 * audit.ScoreCleanliness) +
			(0.20 * audit.ScoreSafetyEquipment)

		if audit.TotalWeightedScore >= 90.0 {
			audit.OverallGrade = domain.GradeAExcellent
		} else if audit.TotalWeightedScore >= 80.0 {
			audit.OverallGrade = domain.GradeBGood
		} else if audit.TotalWeightedScore >= 70.0 {
			audit.OverallGrade = domain.GradeCNeedsImprovement
		} else {
			audit.OverallGrade = domain.GradeDCritical
		}

		insertAuditQuery := `
			INSERT INTO quality_audits (
				tenant_id, outlet_id, audit_number, auditor_user_id, audit_date, audit_type,
				score_food_quality, score_service_speed, score_cleanliness, score_safety_equipment,
				total_weighted_score, overall_grade, summary_notes
			) VALUES (
				$1, $2, $3, $4, CURRENT_DATE, $5,
				$6, $7, $8, $9,
				$10, $11, $12
			) RETURNING id, created_at, updated_at
		`
		err := r.txMgr.Conn(txCtx).QueryRow(
			txCtx, insertAuditQuery,
			audit.TenantID, audit.OutletID, audit.AuditNumber, audit.AuditorUserID, audit.AuditType,
			audit.ScoreFoodQuality, audit.ScoreServiceSpeed, audit.ScoreCleanliness, audit.ScoreSafetyEquipment,
			audit.TotalWeightedScore, audit.OverallGrade, audit.SummaryNotes,
		).Scan(&audit.ID, &audit.CreatedAt, &audit.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert quality audit: %w", err)
		}

		// 3. Insert Action Items
		for i := range audit.ActionItems {
			act := &audit.ActionItems[i]
			insertActQuery := `
				INSERT INTO audit_action_items (
					audit_id, area, issue_description, severity,
					corrective_action, assigned_to_role, due_date, status
				) VALUES (
					$1, $2, $3, $4,
					$5, $6, $7::date, 'OPEN'
				) RETURNING id, created_at
			`
			err := r.txMgr.Conn(txCtx).QueryRow(
				txCtx, insertActQuery,
				audit.ID, act.Area, act.IssueDescription, act.Severity,
				act.CorrectiveAction, act.AssignedToRole, act.DueDate,
			).Scan(&act.ID, &act.CreatedAt)
			if err != nil {
				return fmt.Errorf("insert action item: %w", err)
			}
			act.AuditID = audit.ID
			act.Status = "OPEN"
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return r.GetQualityAudit(ctx, audit.TenantID, audit.ID)
}

// UpdateActionItemStatus updates action item status and marks resolution time.
func (r *PostgresSOPRepository) UpdateActionItemStatus(ctx context.Context, tenantID, actionItemID uuid.UUID, status, resolutionNotes string) (*domain.AuditActionItem, error) {
	var act domain.AuditActionItem

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var resolvedAt *time.Time
		if status == "RESOLVED" {
			now := time.Now()
			resolvedAt = &now
		}

		query := `
			UPDATE audit_action_items a
			SET 
				status = $1,
				resolution_notes = $2,
				resolved_at = $3
			FROM quality_audits qa
			WHERE a.audit_id = qa.id AND qa.tenant_id = $4 AND a.id = $5
			RETURNING a.id, a.audit_id, a.area, a.issue_description, a.severity, a.corrective_action, a.assigned_to_role, a.due_date::text, a.status, a.resolution_notes, a.resolved_at, a.created_at
		`
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, query, status, resolutionNotes, resolvedAt, tenantID, actionItemID).Scan(
			&act.ID, &act.AuditID, &act.Area, &act.IssueDescription, &act.Severity,
			&act.CorrectiveAction, &act.AssignedToRole, &act.DueDate,
			&act.Status, &act.ResolutionNotes, &act.ResolvedAt, &act.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("update action item: %w", err)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &act, nil
}

// GetUserIDByUsername finds user ID by username or email.
func (r *PostgresSOPRepository) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	var id uuid.UUID
	query := `SELECT id FROM users WHERE tenant_id = $1 AND (username = $2 OR email = $2) AND deleted_at IS NULL LIMIT 1`
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, username).Scan(&id)
	if err != nil {
		// Fallback to first user in tenant if not found
		var fallbackID uuid.UUID
		fbErr := r.txMgr.Conn(ctx).QueryRow(ctx, `SELECT id FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`, tenantID).Scan(&fallbackID)
		if fbErr == nil {
			return fallbackID, nil
		}
		return uuid.Nil, fmt.Errorf("get user id: %w", err)
	}
	return id, nil
}

// CreateTemplate creates a new custom SOP template and its items.
func (r *PostgresSOPRepository) CreateTemplate(ctx context.Context, tmpl *domain.SOPTemplate) (*domain.SOPTemplate, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		if tmpl.ID == uuid.Nil {
			tmpl.ID = uuid.New()
		}
		tmpl.IsActive = true
		tmpl.CreatedAt = time.Now()
		tmpl.UpdatedAt = time.Now()

		query := `
			INSERT INTO sop_templates (
				id, tenant_id, outlet_id, code, title, station, shift_phase,
				description, estimated_duration_minutes, is_active, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING created_at, updated_at
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(
			txCtx, query,
			tmpl.ID, tmpl.TenantID, tmpl.OutletID, tmpl.Code, tmpl.Title, tmpl.Station, tmpl.ShiftPhase,
			tmpl.Description, tmpl.EstimatedDurationMinutes, tmpl.IsActive, tmpl.CreatedAt, tmpl.UpdatedAt,
		).Scan(&tmpl.CreatedAt, &tmpl.UpdatedAt); err != nil {
			return fmt.Errorf("insert template: %w", err)
		}

		for i := range tmpl.Items {
			it := &tmpl.Items[i]
			if it.ID == uuid.Nil {
				it.ID = uuid.New()
			}
			it.TemplateID = tmpl.ID
			it.CreatedAt = time.Now()
			if it.SortOrder == 0 {
				it.SortOrder = i + 1
			}

			itemQuery := `
				INSERT INTO sop_template_items (
					id, template_id, sort_order, task_name, task_instruction,
					requires_photo, requires_numeric_input, numeric_unit, min_val, max_val,
					is_critical, created_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			`
			if _, err := r.txMgr.Conn(txCtx).Exec(
				txCtx, itemQuery,
				it.ID, it.TemplateID, it.SortOrder, it.TaskName, it.TaskInstruction,
				it.RequiresPhoto, it.RequiresNumericInput, it.NumericUnit, it.MinVal, it.MaxVal,
				it.IsCritical, it.CreatedAt,
			); err != nil {
				return fmt.Errorf("insert template item: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetTemplate(ctx, tmpl.TenantID, tmpl.ID)
}

// UpdateTemplate updates an existing SOP template.
func (r *PostgresSOPRepository) UpdateTemplate(ctx context.Context, tmpl *domain.SOPTemplate) (*domain.SOPTemplate, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		query := `
			UPDATE sop_templates
			SET title = $1, station = $2, shift_phase = $3, description = $4,
			    estimated_duration_minutes = $5, updated_at = now()
			WHERE tenant_id = $6 AND id = $7
		`
		tag, err := r.txMgr.Conn(txCtx).Exec(
			txCtx, query,
			tmpl.Title, tmpl.Station, tmpl.ShiftPhase, tmpl.Description,
			tmpl.EstimatedDurationMinutes, tmpl.TenantID, tmpl.ID,
		)
		if err != nil {
			return fmt.Errorf("update template: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("template not found")
		}

		if len(tmpl.Items) > 0 {
			// Replace items
			if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `DELETE FROM sop_template_items WHERE template_id = $1`, tmpl.ID); err != nil {
				return fmt.Errorf("delete old items: %w", err)
			}
			for i := range tmpl.Items {
				it := &tmpl.Items[i]
				if it.ID == uuid.Nil {
					it.ID = uuid.New()
				}
				it.TemplateID = tmpl.ID
				it.CreatedAt = time.Now()
				if it.SortOrder == 0 {
					it.SortOrder = i + 1
				}

				itemQuery := `
					INSERT INTO sop_template_items (
						id, template_id, sort_order, task_name, task_instruction,
						requires_photo, requires_numeric_input, numeric_unit, min_val, max_val,
						is_critical, created_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				`
				if _, err := r.txMgr.Conn(txCtx).Exec(
					txCtx, itemQuery,
					it.ID, it.TemplateID, it.SortOrder, it.TaskName, it.TaskInstruction,
					it.RequiresPhoto, it.RequiresNumericInput, it.NumericUnit, it.MinVal, it.MaxVal,
					it.IsCritical, it.CreatedAt,
				); err != nil {
					return fmt.Errorf("insert template item: %w", err)
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetTemplate(ctx, tmpl.TenantID, tmpl.ID)
}

// DeleteTemplate soft deletes a template.
func (r *PostgresSOPRepository) DeleteTemplate(ctx context.Context, tenantID, templateID uuid.UUID) error {
	query := `UPDATE sop_templates SET is_active = false, updated_at = now() WHERE tenant_id = $1 AND id = $2`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, templateID)
	if err != nil {
		return fmt.Errorf("delete template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("template not found")
	}
	return nil
}

// ListHandbookArticles fetches handbook guides.
func (r *PostgresSOPRepository) ListHandbookArticles(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, category string) ([]domain.SOPHandbookArticle, error) {
	query := `
		SELECT 
			id, tenant_id, outlet_id, category, title, subtitle,
			badge_text, icon_name, content_markdown, sort_order, is_active,
			created_at, updated_at
		FROM sop_handbook_articles
		WHERE tenant_id = $1 AND is_active = true
	`
	args := []any{tenantID}
	argIdx := 2
	if outletID != nil {
		query += fmt.Sprintf(" AND (outlet_id IS NULL OR outlet_id = $%d)", argIdx)
		args = append(args, *outletID)
		argIdx++
	}
	if category != "" && category != "ALL" {
		query += fmt.Sprintf(" AND category = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}
	query += " ORDER BY sort_order ASC, created_at ASC"

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list handbook articles: %w", err)
	}
	defer rows.Close()

	articles := make([]domain.SOPHandbookArticle, 0)
	for rows.Next() {
		var a domain.SOPHandbookArticle
		if err := rows.Scan(
			&a.ID, &a.TenantID, &a.OutletID, &a.Category, &a.Title, &a.Subtitle,
			&a.BadgeText, &a.IconName, &a.ContentMarkdown, &a.SortOrder, &a.IsActive,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan handbook article: %w", err)
		}
		articles = append(articles, a)
	}
	return articles, nil
}

// GetHandbookArticle fetches a single article.
func (r *PostgresSOPRepository) GetHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) (*domain.SOPHandbookArticle, error) {
	query := `
		SELECT 
			id, tenant_id, outlet_id, category, title, subtitle,
			badge_text, icon_name, content_markdown, sort_order, is_active,
			created_at, updated_at
		FROM sop_handbook_articles
		WHERE tenant_id = $1 AND id = $2
	`
	var a domain.SOPHandbookArticle
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, articleID).Scan(
		&a.ID, &a.TenantID, &a.OutletID, &a.Category, &a.Title, &a.Subtitle,
		&a.BadgeText, &a.IconName, &a.ContentMarkdown, &a.SortOrder, &a.IsActive,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get handbook article: %w", err)
	}
	return &a, nil
}

// CreateHandbookArticle creates a new handbook guideline.
func (r *PostgresSOPRepository) CreateHandbookArticle(ctx context.Context, article *domain.SOPHandbookArticle) (*domain.SOPHandbookArticle, error) {
	if article.ID == uuid.Nil {
		article.ID = uuid.New()
	}
	article.IsActive = true
	article.CreatedAt = time.Now()
	article.UpdatedAt = time.Now()

	query := `
		INSERT INTO sop_handbook_articles (
			id, tenant_id, outlet_id, category, title, subtitle,
			badge_text, icon_name, content_markdown, sort_order, is_active,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING created_at, updated_at
	`
	err := r.txMgr.Conn(ctx).QueryRow(
		ctx, query,
		article.ID, article.TenantID, article.OutletID, article.Category, article.Title, article.Subtitle,
		article.BadgeText, article.IconName, article.ContentMarkdown, article.SortOrder, article.IsActive,
		article.CreatedAt, article.UpdatedAt,
	).Scan(&article.CreatedAt, &article.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert handbook article: %w", err)
	}
	return article, nil
}

// UpdateHandbookArticle updates an existing handbook guideline.
func (r *PostgresSOPRepository) UpdateHandbookArticle(ctx context.Context, article *domain.SOPHandbookArticle) (*domain.SOPHandbookArticle, error) {
	query := `
		UPDATE sop_handbook_articles
		SET category = $1, title = $2, subtitle = $3, badge_text = $4,
		    icon_name = $5, content_markdown = $6, sort_order = $7,
		    outlet_id = $8, updated_at = now()
		WHERE tenant_id = $9 AND id = $10
		RETURNING updated_at
	`
	err := r.txMgr.Conn(ctx).QueryRow(
		ctx, query,
		article.Category, article.Title, article.Subtitle, article.BadgeText,
		article.IconName, article.ContentMarkdown, article.SortOrder,
		article.OutletID, article.TenantID, article.ID,
	).Scan(&article.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update handbook article: %w", err)
	}
	return article, nil
}

// DeleteHandbookArticle soft deletes a handbook guideline.
func (r *PostgresSOPRepository) DeleteHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) error {
	query := `UPDATE sop_handbook_articles SET is_active = false, updated_at = now() WHERE tenant_id = $1 AND id = $2`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, articleID)
	if err != nil {
		return fmt.Errorf("delete handbook article: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("handbook article not found")
	}
	return nil
}
