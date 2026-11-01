package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Permission identifiers for Finance module.
const (
	PermFinanceView    = "finance.view"
	PermFinanceManage  = "finance.manage"
	PermExpenseCreate  = "finance.expense.create"
	PermExpenseApprove = "finance.expense.approve"
)

type Actor struct {
	TenantID    uuid.UUID
	Username    string
	Roles       []string
	Permissions map[string]struct{}
}

func (a Actor) HasRole(role string) bool {
	for _, r := range a.Roles {
		if r == role {
			return true
		}
	}
	return false
}

func (a Actor) HasPermission(perm string) bool {
	if a.HasRole("OWNER") {
		return true
	}
	_, ok := a.Permissions[perm]
	return ok
}

type ExpenseCategory struct {
	ID          uuid.UUID `json:"id"`
	TenantID    uuid.UUID `json:"tenant_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type OperatingExpense struct {
	ID             uuid.UUID  `json:"id"`
	TenantID       uuid.UUID  `json:"tenant_id"`
	OutletID       *uuid.UUID `json:"outlet_id,omitempty"`
	OutletName     string     `json:"outlet_name,omitempty"`
	CategoryID     uuid.UUID  `json:"category_id"`
	CategoryCode   string     `json:"category_code"`
	CategoryName   string     `json:"category_name"`
	ExpenseDate    string     `json:"expense_date"`
	Title          string     `json:"title"`
	Amount         float64    `json:"amount"`
	PaymentMethod  string     `json:"payment_method"`
	ReceiptRef     string     `json:"receipt_ref,omitempty"`
	RecordedByName string     `json:"recorded_by_name"`
	ApprovedByName string     `json:"approved_by_name,omitempty"`
	Status         string     `json:"status"`
	Notes          string     `json:"notes,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type CreateExpenseInput struct {
	OutletID      *uuid.UUID `json:"outlet_id"`
	CategoryID    uuid.UUID  `json:"category_id"`
	ExpenseDate   string     `json:"expense_date"`
	Title         string     `json:"title"`
	Amount        float64    `json:"amount"`
	PaymentMethod string     `json:"payment_method"`
	ReceiptRef    string     `json:"receipt_ref"`
	Notes         string     `json:"notes"`
}

func (i CreateExpenseInput) Validate() error {
	if i.CategoryID == uuid.Nil {
		return errors.New("kategori biaya wajib dipilih")
	}
	if i.Title == "" {
		return errors.New("judul pengeluaran tidak boleh kosong")
	}
	if i.Amount <= 0 {
		return errors.New("nominal biaya harus lebih besar dari 0")
	}
	if i.ExpenseDate == "" {
		return errors.New("tanggal transaksi wajib diisi")
	}
	return nil
}

type OutletPnL struct {
	OutletID     uuid.UUID `json:"outlet_id"`
	OutletName   string    `json:"outlet_name"`
	NetSales     float64   `json:"net_sales"`
	TotalCOGS    float64   `json:"total_cogs"`
	GrossProfit  float64   `json:"gross_profit"`
	LaborCost    float64   `json:"labor_cost"`
	TotalOpex    float64   `json:"total_opex"`
	NetProfit    float64   `json:"net_profit"`
	NetMarginPct float64   `json:"net_margin_pct"`
}

type PnLSummary struct {
	PeriodLabel          string                  `json:"period_label"`
	PeriodStart          string                  `json:"period_start"`
	PeriodEnd            string                  `json:"period_end"`
	GrossSales           float64                 `json:"gross_sales"`
	Discounts            float64                 `json:"discounts"`
	NetSales             float64                 `json:"net_sales"`
	FoodCost             float64                 `json:"food_cost"`
	WasteAndShrinkage    float64                 `json:"waste_and_shrinkage"`
	TotalCOGS            float64                 `json:"total_cogs"`
	COGSPct              float64                 `json:"cogs_pct"`
	GrossProfit          float64                 `json:"gross_profit"`
	GrossMarginPct       float64                 `json:"gross_margin_pct"`
	LaborCost            float64                 `json:"labor_cost"`
	LaborPct             float64                 `json:"labor_pct"`
	PrimeCost            float64                 `json:"prime_cost"`
	PrimeCostPct         float64                 `json:"prime_cost_pct"`
	UtilitiesAndFuel     float64                 `json:"utilities_and_fuel"`
	MaintenanceAmbiance  float64                 `json:"maintenance_ambiance"`
	ConsumablesPackaging float64                 `json:"consumables_packaging"`
	MarketingPromo       float64                 `json:"marketing_promo"`
	RentAndProperty      float64                 `json:"rent_and_property"`
	AdminAndTech         float64                 `json:"admin_and_tech"`
	TotalOpex            float64                 `json:"total_opex"`
	OpexPct              float64                 `json:"opex_pct"`
	EBITDA               float64                 `json:"ebitda"`
	EBITDAPct            float64                 `json:"ebitda_pct"`
	TaxPB1               float64                 `json:"tax_pb1"`
	NetProfit            float64                 `json:"net_profit"`
	NetMarginPct         float64                 `json:"net_margin_pct"`
	Outlets              []OutletPnL             `json:"outlets"`
	MonthlyTrends        []MonthlyTrendPoint     `json:"monthly_trends"`
	CategoryBreakdown    []CategoryBreakdownItem `json:"category_breakdown"`
}

type MonthlyTrendPoint struct {
	MonthKey   string  `json:"month_key"`
	MonthLabel string  `json:"month_label"`
	Revenue    float64 `json:"revenue"`
	COGS       float64 `json:"cogs"`
	Expenses   float64 `json:"expenses"`
	NetProfit  float64 `json:"net_profit"`
}

type CategoryBreakdownItem struct {
	Code       string  `json:"code"`
	Name       string  `json:"name"`
	Amount     float64 `json:"amount"`
	Percentage float64 `json:"percentage"`
	Color      string  `json:"color"`
}

type BEPSummary struct {
	MonthlyFixedCost        float64 `json:"monthly_fixed_cost"`
	ContributionMarginRatio float64 `json:"contribution_margin_ratio"`
	MonthlyBEPAmount        float64 `json:"monthly_bep_amount"`
	DailyBEPAmount          float64 `json:"daily_bep_amount"`
	TodayRevenue            float64 `json:"today_revenue"`
	TodayProgressPct        float64 `json:"today_progress_pct"`
	IsBEPReached            bool    `json:"is_bep_reached"`
	BEPReachedTime          string  `json:"bep_reached_time,omitempty"`
	ZoneStatus              string  `json:"zone_status"` // "PROFIT_ZONE" | "REACHING_BEP"
}

type Kind int

const (
	KindValidation Kind = iota
	KindNotFound
	KindForbidden
	KindConflict
	KindUnauthorized
)

type DomainError struct {
	Kind    Kind
	Message string
}

func (e *DomainError) Error() string { return e.Message }
