// Package handler exposes the HR & Payroll HTTP API under /api/v1/hr.
package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/payroll/domain"
	"tropical-fnb/backend/internal/modules/payroll/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
)

const maxBodyBytes = 1 << 20 // 1 MiB

// PayrollHandler serves the HR & Payroll endpoints.
type PayrollHandler struct {
	uc  *usecase.Usecase
	log *slog.Logger
}

// NewPayrollHandler creates the handler.
func NewPayrollHandler(uc *usecase.Usecase, log *slog.Logger) *PayrollHandler {
	return &PayrollHandler{uc: uc, log: log}
}

func (h *PayrollHandler) actor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	username := iammw.UsernameFromContext(r.Context())
	if !ok || username == "" {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return domain.Actor{}, false
	}
	return domain.Actor{TenantID: tenantID, Username: username}, true
}

// outletParam reads the outlet_id query parameter, falling back to X-Outlet-ID header.
func (h *PayrollHandler) outletParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := r.URL.Query().Get("outlet_id")
	if raw == "" {
		raw = r.Header.Get("X-Outlet-ID")
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "parameter outlet_id wajib berupa UUID outlet")
		return uuid.Nil, false
	}
	return id, true
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID tidak valid")
		return uuid.Nil, false
	}
	return id, true
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_body", "isi permintaan bukan JSON yang valid")
		return false
	}
	return true
}

func (h *PayrollHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var app *domain.AppError
	if errors.As(err, &app) {
		switch app.Kind {
		case domain.KindValidation:
			httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", app.Message)
		case domain.KindNotFound:
			httpx.Error(w, r, http.StatusNotFound, "not_found", app.Message)
		case domain.KindConflict:
			httpx.Error(w, r, http.StatusConflict, "conflict", app.Message)
		case domain.KindForbidden:
			httpx.Error(w, r, http.StatusForbidden, "forbidden", app.Message)
		}
		return
	}
	httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan pada server")
}

// ------------------------------------------------------------ policy/shift ---

// GetPolicy handles GET /hr/policy.
func (h *PayrollHandler) GetPolicy(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	p, err := h.uc.GetPolicy(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

// UpdatePolicy handles PUT /hr/policy.
func (h *PayrollHandler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var p domain.Policy
	if !decode(w, r, &p) {
		return
	}
	saved, err := h.uc.UpdatePolicy(r.Context(), actor, p)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, saved)
}

// ListShifts handles GET /hr/shifts.
func (h *PayrollHandler) ListShifts(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	shifts, err := h.uc.ListShifts(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(shifts))
}

// --------------------------------------------------------------- employees ---

// ListEmployees handles GET /hr/employees.
func (h *PayrollHandler) ListEmployees(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	list, err := h.uc.ListEmployees(r.Context(), actor, outletID, r.URL.Query().Get("include_inactive") == "true")
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(list))
}

// CreateEmployee handles POST /hr/employees.
func (h *PayrollHandler) CreateEmployee(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.EmployeeInput
	if !decode(w, r, &in) {
		return
	}
	e, err := h.uc.CreateEmployee(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, e)
}

// UpdateEmployee handles PUT /hr/employees/{id}.
func (h *PayrollHandler) UpdateEmployee(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in usecase.EmployeeInput
	if !decode(w, r, &in) {
		return
	}
	e, err := h.uc.UpdateEmployee(r.Context(), actor, id, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, e)
}

// -------------------------------------------------------------- attendance ---

// ListAttendance handles GET /hr/attendance.
func (h *PayrollHandler) ListAttendance(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	list, err := h.uc.ListAttendance(r.Context(), actor, outletID, r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(list))
}

// UpsertAttendance handles POST /hr/attendance (manual entry / correction).
func (h *PayrollHandler) UpsertAttendance(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.AttendanceInput
	if !decode(w, r, &in) {
		return
	}
	a, err := h.uc.UpsertAttendance(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, a)
}

// SetOvertimeApproval handles PATCH /hr/attendance/{id}/overtime.
func (h *PayrollHandler) SetOvertimeApproval(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var body struct {
		Approved bool `json:"approved"`
	}
	if !decode(w, r, &body) {
		return
	}
	a, err := h.uc.SetOvertimeApproval(r.Context(), actor, id, body.Approved)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, a)
}

// ClockIn handles POST /hr/attendance/clock-in (the caller's own attendance).
func (h *PayrollHandler) ClockIn(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.ClockInInput
	if !decode(w, r, &in) {
		return
	}
	a, err := h.uc.ClockIn(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, a)
}

// ClockOut handles POST /hr/attendance/clock-out.
func (h *PayrollHandler) ClockOut(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var body struct {
		EmployeeID *uuid.UUID `json:"employee_id,omitempty"`
	}
	if r.ContentLength > 0 {
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&body)
	}
	if body.EmployeeID == nil {
		if q := r.URL.Query().Get("employee_id"); q != "" {
			if id, err := uuid.Parse(q); err == nil {
				body.EmployeeID = &id
			}
		}
	}
	a, err := h.uc.ClockOut(r.Context(), actor, body.EmployeeID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, a)
}

// ------------------------------------------------------------------ kasbon ---

// ListAdvances handles GET /hr/advances.
func (h *PayrollHandler) ListAdvances(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	list, err := h.uc.ListAdvances(r.Context(), actor, outletID, r.URL.Query().Get("only_active") == "true")
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(list))
}

// CreateAdvance handles POST /hr/advances.
func (h *PayrollHandler) CreateAdvance(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.AdvanceInput
	if !decode(w, r, &in) {
		return
	}
	a, err := h.uc.CreateAdvance(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, a)
}

// CancelAdvance handles POST /hr/advances/{id}/cancel.
func (h *PayrollHandler) CancelAdvance(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	a, err := h.uc.CancelAdvance(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, a)
}

// ----------------------------------------------------------------- payroll ---

// ListRuns handles GET /hr/payroll/runs.
func (h *PayrollHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	outletID, ok := h.outletParam(w, r)
	if !ok {
		return
	}
	list, err := h.uc.ListRuns(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(list))
}

// GetRun handles GET /hr/payroll/runs/{id}.
func (h *PayrollHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.uc.GetRunDetail(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	if d != nil {
		d.Slips = httpx.EnsureSlice(d.Slips)
	}
	httpx.JSON(w, http.StatusOK, d)
}

// GenerateRun handles POST /hr/payroll/runs.
func (h *PayrollHandler) GenerateRun(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var body struct {
		OutletID uuid.UUID `json:"outlet_id"`
		Year     int       `json:"year"`
		Month    int       `json:"month"`
	}
	if !decode(w, r, &body) {
		return
	}
	d, err := h.uc.GenerateRun(r.Context(), actor, body.OutletID, body.Year, body.Month)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	if d != nil {
		d.Slips = httpx.EnsureSlice(d.Slips)
	}
	httpx.JSON(w, http.StatusCreated, d)
}

func (h *PayrollHandler) runTransition(w http.ResponseWriter, r *http.Request, do func(domain.Actor, uuid.UUID) (*domain.PayrollRun, error)) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	run, err := do(actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, run)
}

// ApproveRun handles POST /hr/payroll/runs/{id}/approve.
func (h *PayrollHandler) ApproveRun(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, func(a domain.Actor, id uuid.UUID) (*domain.PayrollRun, error) {
		return h.uc.ApproveRun(r.Context(), a, id)
	})
}

// MarkRunPaid handles POST /hr/payroll/runs/{id}/pay.
func (h *PayrollHandler) MarkRunPaid(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, func(a domain.Actor, id uuid.UUID) (*domain.PayrollRun, error) {
		return h.uc.MarkRunPaid(r.Context(), a, id)
	})
}

// CancelRun handles POST /hr/payroll/runs/{id}/cancel.
func (h *PayrollHandler) CancelRun(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, func(a domain.Actor, id uuid.UUID) (*domain.PayrollRun, error) {
		return h.uc.CancelRun(r.Context(), a, id)
	})
}
