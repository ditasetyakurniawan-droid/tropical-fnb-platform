package usecase

import (
	"context"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/finance/domain"
	"tropical-fnb/backend/internal/modules/finance/repository"
)

type FinanceUsecase struct {
	repo *repository.FinanceRepo
}

func NewFinanceUsecase(repo *repository.FinanceRepo) *FinanceUsecase {
	return &FinanceUsecase{repo: repo}
}

func (u *FinanceUsecase) ListCategories(ctx context.Context, actor domain.Actor) ([]domain.ExpenseCategory, error) {
	if !actor.HasPermission(domain.PermFinanceView) && !actor.HasRole("OUTLET_MANAGER") {
		return nil, &domain.DomainError{Kind: domain.KindForbidden, Message: "tidak memiliki hak akses laporan keuangan"}
	}
	return u.repo.ListCategories(ctx, actor.TenantID)
}

func (u *FinanceUsecase) ListExpenses(ctx context.Context, actor domain.Actor, outletID *uuid.UUID, startDate, endDate string) ([]domain.OperatingExpense, error) {
	if !actor.HasPermission(domain.PermFinanceView) && !actor.HasRole("OUTLET_MANAGER") {
		return nil, &domain.DomainError{Kind: domain.KindForbidden, Message: "tidak memiliki hak akses data pengeluaran"}
	}
	return u.repo.ListExpenses(ctx, actor.TenantID, outletID, startDate, endDate)
}

func (u *FinanceUsecase) CreateExpense(ctx context.Context, actor domain.Actor, input domain.CreateExpenseInput) (*domain.OperatingExpense, error) {
	if !actor.HasPermission(domain.PermExpenseCreate) && !actor.HasRole("OUTLET_MANAGER") && !actor.HasRole("HEAD_CHEF") && !actor.HasRole("KITCHEN_CHEF") {
		return nil, &domain.DomainError{Kind: domain.KindForbidden, Message: "tidak memiliki wewenang mencatat pengeluaran"}
	}
	if err := input.Validate(); err != nil {
		return nil, &domain.DomainError{Kind: domain.KindValidation, Message: err.Error()}
	}
	return u.repo.CreateExpense(ctx, actor.TenantID, input, actor.Username)
}

func (u *FinanceUsecase) GetPnLSummary(ctx context.Context, actor domain.Actor, outletID *uuid.UUID, startDate, endDate string) (*domain.PnLSummary, error) {
	if !actor.HasPermission(domain.PermFinanceView) && !actor.HasRole("OUTLET_MANAGER") {
		return nil, &domain.DomainError{Kind: domain.KindForbidden, Message: "tidak memiliki wewenang melihat laporan laba rugi (P&L)"}
	}
	return u.repo.GetPnLSummary(ctx, actor.TenantID, outletID, startDate, endDate)
}

func (u *FinanceUsecase) GetBEPSummary(ctx context.Context, actor domain.Actor, outletID *uuid.UUID) (*domain.BEPSummary, error) {
	if !actor.HasPermission(domain.PermFinanceView) && !actor.HasRole("OUTLET_MANAGER") {
		return nil, &domain.DomainError{Kind: domain.KindForbidden, Message: "tidak memiliki wewenang melihat kalkulasi BEP"}
	}
	return u.repo.GetBEPSummary(ctx, actor.TenantID, outletID)
}
