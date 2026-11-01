package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	iamtoken "tropical-fnb/backend/internal/modules/iam/token"
	"tropical-fnb/backend/internal/modules/sop/domain"
	"tropical-fnb/backend/internal/modules/sop/handler"
	"tropical-fnb/backend/internal/modules/sop/usecase"
)

type mockSOPRepo struct {
	templates   []domain.SOPTemplate
	runs        []domain.SOPChecklistRun
	records     map[uuid.UUID][]domain.SOPChecklistItemRecord
	audits      []domain.QualityAudit
	actionItems []domain.AuditActionItem
}

func (m *mockSOPRepo) ListTemplates(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station, shiftPhase string) ([]domain.SOPTemplate, error) {
	return m.templates, nil
}

func (m *mockSOPRepo) GetTemplate(ctx context.Context, tenantID, templateID uuid.UUID) (*domain.SOPTemplate, error) {
	for _, t := range m.templates {
		if t.ID == templateID {
			return &t, nil
		}
	}
	return nil, nil
}

func (m *mockSOPRepo) ListChecklistRuns(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date string, status string) ([]domain.SOPChecklistRun, error) {
	return m.runs, nil
}

func (m *mockSOPRepo) GetChecklistRun(ctx context.Context, tenantID, runID uuid.UUID) (*domain.SOPChecklistRun, error) {
	for _, r := range m.runs {
		if r.ID == runID {
			r.Records = m.records[runID]
			return &r, nil
		}
	}
	return nil, nil
}

func (m *mockSOPRepo) CreateChecklistRun(ctx context.Context, tenantID, outletID, templateID, assignedToUserID uuid.UUID, shiftName string) (*domain.SOPChecklistRun, error) {
	run := domain.SOPChecklistRun{
		ID:               uuid.New(),
		TenantID:         tenantID,
		OutletID:         outletID,
		TemplateID:       templateID,
		RunDate:          time.Now().Format("2006-01-02"),
		ShiftName:        shiftName,
		AssignedToUserID: assignedToUserID,
		Status:           domain.RunStatusInProgress,
		StartedAt:        time.Now(),
		TotalItems:       2,
		CompletedItems:   0,
	}
	m.runs = append(m.runs, run)
	return &run, nil
}

func (m *mockSOPRepo) UpdateChecklistItem(ctx context.Context, tenantID, runID, recordID uuid.UUID, isChecked bool, numericVal *float64, photoURL, notes *string) (*domain.SOPChecklistItemRecord, error) {
	rec := domain.SOPChecklistItemRecord{
		ID:                 recordID,
		RunID:              runID,
		IsChecked:          isChecked,
		NumericActualValue: numericVal,
		IsWithinRange:      true,
		PhotoURL:           photoURL,
		Notes:              notes,
	}
	return &rec, nil
}

func (m *mockSOPRepo) CompleteChecklistRun(ctx context.Context, tenantID, runID, supervisorUserID uuid.UUID, notes string) (*domain.SOPChecklistRun, error) {
	for i := range m.runs {
		if m.runs[i].ID == runID {
			m.runs[i].Status = domain.RunStatusCompleted
			now := time.Now()
			m.runs[i].CompletedAt = &now
			m.runs[i].SupervisorNotes = &notes
			return &m.runs[i], nil
		}
	}
	return nil, nil
}

func (m *mockSOPRepo) ListQualityAudits(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.QualityAudit, error) {
	return m.audits, nil
}

func (m *mockSOPRepo) GetQualityAudit(ctx context.Context, tenantID, auditID uuid.UUID) (*domain.QualityAudit, error) {
	for _, a := range m.audits {
		if a.ID == auditID {
			return &a, nil
		}
	}
	return nil, nil
}

func (m *mockSOPRepo) CreateQualityAudit(ctx context.Context, audit *domain.QualityAudit) (*domain.QualityAudit, error) {
	audit.ID = uuid.New()
	audit.AuditNumber = "QAC-20261025-001"
	audit.TotalWeightedScore = 95.0
	audit.OverallGrade = domain.GradeAExcellent
	m.audits = append(m.audits, *audit)
	return audit, nil
}

func (m *mockSOPRepo) UpdateActionItemStatus(ctx context.Context, tenantID, actionItemID uuid.UUID, status, resolutionNotes string) (*domain.AuditActionItem, error) {
	for i := range m.actionItems {
		if m.actionItems[i].ID == actionItemID {
			m.actionItems[i].Status = status
			m.actionItems[i].ResolutionNotes = &resolutionNotes
			now := time.Now()
			m.actionItems[i].ResolvedAt = &now
			return &m.actionItems[i], nil
		}
	}
	return &domain.AuditActionItem{ID: actionItemID, Status: status}, nil
}

func (m *mockSOPRepo) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	return uuid.New(), nil
}

func (m *mockSOPRepo) CreateTemplate(ctx context.Context, tmpl *domain.SOPTemplate) (*domain.SOPTemplate, error) {
	tmpl.ID = uuid.New()
	tmpl.CreatedAt = time.Now()
	tmpl.UpdatedAt = time.Now()
	m.templates = append(m.templates, *tmpl)
	return tmpl, nil
}

func (m *mockSOPRepo) UpdateTemplate(ctx context.Context, tmpl *domain.SOPTemplate) (*domain.SOPTemplate, error) {
	for i := range m.templates {
		if m.templates[i].ID == tmpl.ID {
			m.templates[i] = *tmpl
			return tmpl, nil
		}
	}
	return tmpl, nil
}

func (m *mockSOPRepo) DeleteTemplate(ctx context.Context, tenantID, templateID uuid.UUID) error {
	for i := range m.templates {
		if m.templates[i].ID == templateID {
			m.templates = append(m.templates[:i], m.templates[i+1:]...)
			return nil
		}
	}
	return nil
}

func (m *mockSOPRepo) ListHandbookArticles(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, category string) ([]domain.SOPHandbookArticle, error) {
	return []domain.SOPHandbookArticle{}, nil
}

func (m *mockSOPRepo) GetHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) (*domain.SOPHandbookArticle, error) {
	return nil, nil
}

func (m *mockSOPRepo) CreateHandbookArticle(ctx context.Context, article *domain.SOPHandbookArticle) (*domain.SOPHandbookArticle, error) {
	article.ID = uuid.New()
	article.CreatedAt = time.Now()
	article.UpdatedAt = time.Now()
	return article, nil
}

func (m *mockSOPRepo) UpdateHandbookArticle(ctx context.Context, article *domain.SOPHandbookArticle) (*domain.SOPHandbookArticle, error) {
	article.UpdatedAt = time.Now()
	return article, nil
}

func (m *mockSOPRepo) DeleteHandbookArticle(ctx context.Context, tenantID, articleID uuid.UUID) error {
	return nil
}

const testSecret = "01234567890123456789012345678901"

func setupSOPRouter(repo domain.SOPRepository, jwtSecret string) (http.Handler, *iamtoken.JWTManager) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	jwtMgr, err := iamtoken.NewJWTManager(jwtSecret)
	if err != nil {
		panic(err)
	}
	uc := usecase.NewSOPUsecase(repo)
	h := handler.NewSOPHandler(uc, log)

	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(iammw.Authenticate(jwtMgr))

		api.Get("/sop/templates", h.ListTemplates)
		api.Get("/sop/templates/{id}", h.GetTemplate)
		api.Get("/sop/runs", h.ListChecklistRuns)
		api.Get("/sop/runs/{id}", h.GetChecklistRun)
		api.Post("/sop/runs", h.CreateChecklistRun)
		api.Put("/sop/runs/{id}/items/{recordId}", h.UpdateChecklistItem)
		api.Post("/sop/runs/{id}/complete", h.CompleteChecklistRun)

		api.Get("/sop/audits", h.ListQualityAudits)
		api.Get("/sop/audits/{id}", h.GetQualityAudit)
		api.Post("/sop/audits", h.CreateQualityAudit)
		api.Put("/sop/audits/actions/{id}", h.UpdateActionItemStatus)
	})
	return r, jwtMgr
}

func generateSOPTestToken(t *testing.T, jwtMgr *iamtoken.JWTManager, tenantID, outletID uuid.UUID) string {
	tok, _, err := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "spv.steak",
		FullName:    "Rian Pratama",
		Roles:       []string{"OUTLET_SUPERVISOR", "STORE_MANAGER"},
		IsGlobalAll: true,
	}, 1*time.Hour)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	return tok
}

func TestSOPHandler_ListTemplates(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()

	repo := &mockSOPRepo{
		templates: []domain.SOPTemplate{
			{
				ID:         uuid.New(),
				TenantID:   tenantID,
				Code:       "SOP-GRILL-OPEN",
				Title:      "SOP Opening Grill Steak",
				Station:    "GRILL_STEAK",
				ShiftPhase: "OPENING",
				IsActive:   true,
			},
		},
	}

	router, jwtMgr := setupSOPRouter(repo, testSecret)
	token := generateSOPTestToken(t, jwtMgr, tenantID, outletID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sop/templates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var res []domain.SOPTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if len(res) != 1 || res[0].Code != "SOP-GRILL-OPEN" {
		t.Errorf("unexpected template list: %+v", res)
	}
}

func TestSOPHandler_CreateAndCompleteChecklistRun(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	templateID := uuid.New()

	repo := &mockSOPRepo{}
	router, jwtMgr := setupSOPRouter(repo, testSecret)
	token := generateSOPTestToken(t, jwtMgr, tenantID, outletID)

	// 1. Create run
	payload := domain.CreateChecklistRunRequest{
		OutletID:   outletID,
		TemplateID: templateID,
		ShiftName:  "SHIFT_PAGI",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sop/runs", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	var created domain.SOPChecklistRun
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if created.Status != domain.RunStatusInProgress {
		t.Errorf("expected IN_PROGRESS, got %s", created.Status)
	}

	// 2. Complete run
	compReq := domain.CompleteChecklistRunRequest{SupervisorNotes: "Semua item aman"}
	compBody, _ := json.Marshal(compReq)
	cReq := httptest.NewRequest(http.MethodPost, "/api/v1/sop/runs/"+created.ID.String()+"/complete", bytes.NewReader(compBody))
	cReq.Header.Set("Authorization", "Bearer "+token)
	cReq.Header.Set("Content-Type", "application/json")
	cW := httptest.NewRecorder()

	router.ServeHTTP(cW, cReq)
	if cW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", cW.Code, cW.Body.String())
	}
}

func TestSOPHandler_CreateQualityAudit(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()

	repo := &mockSOPRepo{}
	router, jwtMgr := setupSOPRouter(repo, testSecret)
	token := generateSOPTestToken(t, jwtMgr, tenantID, outletID)

	payload := domain.CreateQualityAuditRequest{
		OutletID:             outletID,
		AuditType:            "ROUTINE_WEEKLY",
		ScoreFoodQuality:     95.0,
		ScoreServiceSpeed:    90.0,
		ScoreCleanliness:     96.0,
		ScoreSafetyEquipment: 98.0,
		SummaryNotes:         "Semua standar prima.",
		ActionItems: []domain.CreateActionItemInput{
			{
				Area:             "Dapur Grill",
				IssueDescription: "Cek kembali panggangan",
				Severity:         "LOW",
				CorrectiveAction: "Pembersihan kerak",
				AssignedToRole:   "KITCHEN_LEAD",
				DueDate:          "2026-10-30",
			},
		},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sop/audits", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	var created domain.QualityAudit
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if created.OverallGrade != domain.GradeAExcellent {
		t.Errorf("expected grade A_EXCELLENT, got %s", created.OverallGrade)
	}
}
