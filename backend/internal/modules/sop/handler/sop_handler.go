// Package handler exposes HTTP REST APIs for Daily SOP Checklists and Quality Audits.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/sop/domain"
	"tropical-fnb/backend/internal/modules/sop/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
)

type SOPHandler struct {
	uc  *usecase.SOPUsecase
	log *slog.Logger
}

func NewSOPHandler(uc *usecase.SOPUsecase, log *slog.Logger) *SOPHandler {
	return &SOPHandler{uc: uc, log: log}
}

func (h *SOPHandler) resolveTenantAndOutlet(r *http.Request) (uuid.UUID, *uuid.UUID, bool) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, nil, false
	}

	var outletID *uuid.UUID
	if oid, ok := iammw.ActiveOutletIDFromContext(r.Context()); ok {
		outletID = &oid
	} else if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if parsed, err := uuid.Parse(q); err == nil {
			outletID = &parsed
		}
	}
	return tenantID, outletID, true
}

// ListTemplates handles GET /api/v1/sop/templates.
func (h *SOPHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	station := r.URL.Query().Get("station")
	shiftPhase := r.URL.Query().Get("shift_phase")

	templates, err := h.uc.ListTemplates(r.Context(), tenantID, outletID, station, shiftPhase)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat template SOP")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(templates))
}

// GetTemplate handles GET /api/v1/sop/templates/{id}.
func (h *SOPHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	tmplID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID template tidak valid")
		return
	}

	tmpl, err := h.uc.GetTemplate(r.Context(), tenantID, tmplID)
	if err != nil {
		httpx.Error(w, r, http.StatusNotFound, "not_found", "template SOP tidak ditemukan")
		return
	}
	if tmpl != nil {
		tmpl.Items = httpx.EnsureSlice(tmpl.Items)
	}

	httpx.JSON(w, http.StatusOK, tmpl)
}

// ListChecklistRuns handles GET /api/v1/sop/runs.
func (h *SOPHandler) ListChecklistRuns(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	date := r.URL.Query().Get("date")
	status := r.URL.Query().Get("status")

	runs, err := h.uc.ListChecklistRuns(r.Context(), tenantID, outletID, date, status)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat sesi checklist SOP")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(runs))
}

// GetChecklistRun handles GET /api/v1/sop/runs/{id}.
func (h *SOPHandler) GetChecklistRun(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID checklist run tidak valid")
		return
	}

	run, err := h.uc.GetChecklistRun(r.Context(), tenantID, runID)
	if err != nil {
		httpx.Error(w, r, http.StatusNotFound, "not_found", "sesi checklist SOP tidak ditemukan")
		return
	}
	if run != nil {
		run.Records = httpx.EnsureSlice(run.Records)
	}

	httpx.JSON(w, http.StatusOK, run)
}

// CreateChecklistRun handles POST /api/v1/sop/runs.
func (h *SOPHandler) CreateChecklistRun(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateChecklistRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	username := iammw.UsernameFromContext(r.Context())
	userID, _ := h.uc.GetUserIDByUsername(r.Context(), tenantID, username)

	run, err := h.uc.CreateChecklistRun(r.Context(), tenantID, userID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if run != nil {
		run.Records = httpx.EnsureSlice(run.Records)
	}

	httpx.JSON(w, http.StatusCreated, run)
}

// UpdateChecklistItem handles PUT /api/v1/sop/runs/{id}/items/{recordId}.
func (h *SOPHandler) UpdateChecklistItem(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID checklist run tidak valid")
		return
	}

	recordID, err := uuid.Parse(chi.URLParam(r, "recordId"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID item record tidak valid")
		return
	}

	var req domain.UpdateChecklistItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	rec, err := h.uc.UpdateChecklistItem(r.Context(), tenantID, runID, recordID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, rec)
}

// CompleteChecklistRun handles POST /api/v1/sop/runs/{id}/complete.
func (h *SOPHandler) CompleteChecklistRun(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	runID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID checklist run tidak valid")
		return
	}

	var req domain.CompleteChecklistRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.SupervisorNotes = "Selesai ditinjau"
	}

	username := iammw.UsernameFromContext(r.Context())
	supervisorID, _ := h.uc.GetUserIDByUsername(r.Context(), tenantID, username)

	run, err := h.uc.CompleteChecklistRun(r.Context(), tenantID, runID, supervisorID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if run != nil {
		run.Records = httpx.EnsureSlice(run.Records)
	}

	httpx.JSON(w, http.StatusOK, run)
}

// ListQualityAudits handles GET /api/v1/sop/audits.
func (h *SOPHandler) ListQualityAudits(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	audits, err := h.uc.ListQualityAudits(r.Context(), tenantID, outletID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat rapor audit mutu")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(audits))
}

// GetQualityAudit handles GET /api/v1/sop/audits/{id}.
func (h *SOPHandler) GetQualityAudit(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	auditID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID audit tidak valid")
		return
	}

	audit, err := h.uc.GetQualityAudit(r.Context(), tenantID, auditID)
	if err != nil {
		httpx.Error(w, r, http.StatusNotFound, "not_found", "rapor audit tidak ditemukan")
		return
	}
	if audit != nil {
		audit.ActionItems = httpx.EnsureSlice(audit.ActionItems)
	}

	httpx.JSON(w, http.StatusOK, audit)
}

// CreateQualityAudit handles POST /api/v1/sop/audits.
func (h *SOPHandler) CreateQualityAudit(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateQualityAuditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	username := iammw.UsernameFromContext(r.Context())
	auditorID, _ := h.uc.GetUserIDByUsername(r.Context(), tenantID, username)

	audit, err := h.uc.CreateQualityAudit(r.Context(), tenantID, auditorID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if audit != nil {
		audit.ActionItems = httpx.EnsureSlice(audit.ActionItems)
	}

	httpx.JSON(w, http.StatusCreated, audit)
}

// UpdateActionItemStatus handles PUT /api/v1/sop/audits/actions/{id}.
func (h *SOPHandler) UpdateActionItemStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	actionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID action item tidak valid")
		return
	}

	var req domain.UpdateActionItemStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	act, err := h.uc.UpdateActionItemStatus(r.Context(), tenantID, actionID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, act)
}

// CreateTemplate handles POST /api/v1/sop/templates.
func (h *SOPHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateSOPTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	tmpl, err := h.uc.CreateTemplate(r.Context(), tenantID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if tmpl != nil {
		tmpl.Items = httpx.EnsureSlice(tmpl.Items)
	}

	httpx.JSON(w, http.StatusCreated, tmpl)
}

// UpdateTemplate handles PUT /api/v1/sop/templates/{id}.
func (h *SOPHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	tmplID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID template tidak valid")
		return
	}

	var req domain.UpdateSOPTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	tmpl, err := h.uc.UpdateTemplate(r.Context(), tenantID, tmplID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if tmpl != nil {
		tmpl.Items = httpx.EnsureSlice(tmpl.Items)
	}

	httpx.JSON(w, http.StatusOK, tmpl)
}

// DeleteTemplate handles DELETE /api/v1/sop/templates/{id}.
func (h *SOPHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	tmplID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID template tidak valid")
		return
	}

	if err := h.uc.DeleteTemplate(r.Context(), tenantID, tmplID); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "template SOP berhasil dinonaktifkan"})
}

// ListHandbookArticles handles GET /api/v1/sop/handbook.
func (h *SOPHandler) ListHandbookArticles(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	category := r.URL.Query().Get("category")
	articles, err := h.uc.ListHandbookArticles(r.Context(), tenantID, outletID, category)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat panduan SOP")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(articles))
}

// GetHandbookArticle handles GET /api/v1/sop/handbook/{id}.
func (h *SOPHandler) GetHandbookArticle(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID panduan tidak valid")
		return
	}

	article, err := h.uc.GetHandbookArticle(r.Context(), tenantID, articleID)
	if err != nil {
		httpx.Error(w, r, http.StatusNotFound, "not_found", "panduan SOP tidak ditemukan")
		return
	}

	httpx.JSON(w, http.StatusOK, article)
}

// CreateHandbookArticle handles POST /api/v1/sop/handbook.
func (h *SOPHandler) CreateHandbookArticle(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateHandbookArticleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	article, err := h.uc.CreateHandbookArticle(r.Context(), tenantID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, article)
}

// UpdateHandbookArticle handles PUT /api/v1/sop/handbook/{id}.
func (h *SOPHandler) UpdateHandbookArticle(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID panduan tidak valid")
		return
	}

	var req domain.UpdateHandbookArticleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	article, err := h.uc.UpdateHandbookArticle(r.Context(), tenantID, articleID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, article)
}

// DeleteHandbookArticle handles DELETE /api/v1/sop/handbook/{id}.
func (h *SOPHandler) DeleteHandbookArticle(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID panduan tidak valid")
		return
	}

	if err := h.uc.DeleteHandbookArticle(r.Context(), tenantID, articleID); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "panduan SOP berhasil dihapus"})
}
