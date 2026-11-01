package usecase

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/crm/domain"
	"tropical-fnb/backend/internal/modules/crm/repository"
)

type CRMUsecase struct {
	repo *repository.CRMRepository
}

func NewCRMUsecase(repo *repository.CRMRepository) *CRMUsecase {
	return &CRMUsecase{repo: repo}
}

// Tier weight helper for hierarchy comparison
func tierWeight(tier string) int {
	switch strings.ToUpper(tier) {
	case domain.TierTropicalVIP:
		return 4
	case domain.TierGold:
		return 3
	case domain.TierSilver:
		return 2
	case domain.TierBronze:
		return 1
	default:
		return 0
	}
}

// ListCustomers retrieves customer list.
func (u *CRMUsecase) ListCustomers(ctx context.Context, actor domain.Actor, search string, tier *string) ([]domain.Customer, error) {
	return u.repo.ListCustomers(ctx, actor.TenantID, search, tier)
}

// GetCustomerDetail returns customer profile along with their points history.
func (u *CRMUsecase) GetCustomerDetail(ctx context.Context, actor domain.Actor, customerID uuid.UUID) (*domain.CustomerDetail, error) {
	cust, err := u.repo.GetCustomerByID(ctx, actor.TenantID, customerID)
	if err != nil {
		return nil, err
	}

	ledger, err := u.repo.ListPointsLedger(ctx, actor.TenantID, &customerID, 20)
	if err != nil {
		return nil, err
	}

	return &domain.CustomerDetail{
		Customer:     *cust,
		RecentPoints: ledger,
	}, nil
}

// CreateCustomer validates and registers a new customer.
func (u *CRMUsecase) CreateCustomer(ctx context.Context, actor domain.Actor, req domain.CreateCustomerRequest) (*domain.Customer, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, domain.NewValidationError("NAME_REQUIRED", "Nama pelanggan wajib diisi")
	}
	cleanPhone := strings.TrimSpace(req.Phone)
	if cleanPhone == "" {
		return nil, domain.NewValidationError("PHONE_REQUIRED", "Nomor telepon WhatsApp pelanggan wajib diisi")
	}
	req.Phone = cleanPhone

	return u.repo.CreateCustomer(ctx, actor.TenantID, req)
}

// UpdateCustomer updates customer metadata.
func (u *CRMUsecase) UpdateCustomer(ctx context.Context, actor domain.Actor, customerID uuid.UUID, req domain.UpdateCustomerRequest) (*domain.Customer, error) {
	return u.repo.UpdateCustomer(ctx, actor.TenantID, customerID, req)
}

// AdjustPoints handles loyalty points changes (earn, redeem, adjustment).
func (u *CRMUsecase) AdjustPoints(ctx context.Context, actor domain.Actor, customerID uuid.UUID, req domain.AdjustPointsRequest) (*domain.PointsLedgerEntry, error) {
	txType := strings.ToUpper(strings.TrimSpace(req.TxType))
	if txType != domain.TxTypeEarn && txType != domain.TxTypeRedeem && txType != domain.TxTypeAdjustment {
		return nil, domain.NewValidationError("INVALID_TX_TYPE", "Tipe transaksi poin harus EARN, REDEEM, atau ADJUSTMENT")
	}

	if req.Points == 0 {
		return nil, domain.NewValidationError("INVALID_POINTS", "Jumlah poin tidak boleh 0")
	}

	// If REDEEM, points must be negative or converted to negative
	pts := req.Points
	if txType == domain.TxTypeRedeem && pts > 0 {
		pts = -pts
	}

	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		desc = fmt.Sprintf("Penyesuaian poin oleh %s", actor.Username)
	}

	return u.repo.AdjustPoints(ctx, actor.TenantID, customerID, txType, pts, desc, req.OrderID)
}

// ListPointsLedger returns all recent points ledger transactions.
func (u *CRMUsecase) ListPointsLedger(ctx context.Context, actor domain.Actor, customerID *uuid.UUID, limit int) ([]domain.PointsLedgerEntry, error) {
	return u.repo.ListPointsLedger(ctx, actor.TenantID, customerID, limit)
}

// ListVouchers returns all vouchers.
func (u *CRMUsecase) ListVouchers(ctx context.Context, actor domain.Actor) ([]domain.Voucher, error) {
	return u.repo.ListVouchers(ctx, actor.TenantID)
}

// CreateVoucher validates and saves a new promo voucher.
func (u *CRMUsecase) CreateVoucher(ctx context.Context, actor domain.Actor, req domain.CreateVoucherRequest) (*domain.Voucher, error) {
	cleanCode := strings.ToUpper(strings.TrimSpace(req.Code))
	if cleanCode == "" {
		return nil, domain.NewValidationError("CODE_REQUIRED", "Kode voucher tidak boleh kosong")
	}
	req.Code = cleanCode

	if strings.TrimSpace(req.Title) == "" {
		return nil, domain.NewValidationError("TITLE_REQUIRED", "Judul voucher tidak boleh kosong")
	}

	req.DiscountType = strings.ToUpper(strings.TrimSpace(req.DiscountType))
	if req.DiscountType != domain.DiscountTypePercentage && req.DiscountType != domain.DiscountTypeFixedAmount {
		return nil, domain.NewValidationError("INVALID_DISCOUNT_TYPE", "Tipe diskon harus PERCENTAGE atau FIXED_AMOUNT")
	}

	if req.DiscountValue <= 0 {
		return nil, domain.NewValidationError("INVALID_DISCOUNT_VALUE", "Nilai diskon harus lebih besar dari 0")
	}

	if req.DiscountType == domain.DiscountTypePercentage && req.DiscountValue > 100 {
		return nil, domain.NewValidationError("INVALID_PERCENTAGE", "Diskon persentase tidak boleh lebih dari 100%")
	}

	if req.UsageLimitTotal <= 0 {
		req.UsageLimitTotal = 100
	}

	if req.ValidFrom == "" || req.ValidUntil == "" {
		return nil, domain.NewValidationError("INVALID_VALIDITY_DATES", "Tanggal mulai dan berakhir voucher wajib diisi")
	}

	return u.repo.CreateVoucher(ctx, actor.TenantID, req)
}

// ValidateVoucher tests a voucher against an order subtotal and customer tier.
func (u *CRMUsecase) ValidateVoucher(ctx context.Context, actor domain.Actor, req domain.ValidateVoucherRequest) (*domain.ValidateVoucherResponse, error) {
	codeClean := strings.TrimSpace(req.Code)
	if codeClean == "" {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: "Kode voucher tidak boleh kosong",
		}, nil
	}

	v, err := u.repo.GetVoucherByCode(ctx, actor.TenantID, codeClean)
	if err != nil {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: fmt.Sprintf("Kode voucher '%s' tidak ditemukan", codeClean),
		}, nil
	}

	if !v.IsActive {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: "Voucher ini sedang tidak aktif",
			Voucher: v,
		}, nil
	}

	today := time.Now().Format("2006-01-02")
	if today < v.ValidFrom {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: fmt.Sprintf("Voucher baru mulai berlaku pada %s", v.ValidFrom),
			Voucher: v,
		}, nil
	}
	if today > v.ValidUntil {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: fmt.Sprintf("Voucher telah kadaluwarsa pada %s", v.ValidUntil),
			Voucher: v,
		}, nil
	}

	if v.UsageLimitTotal > 0 && v.UsageCount >= v.UsageLimitTotal {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: "Kuota pemakaian voucher telah habis",
			Voucher: v,
		}, nil
	}

	if req.Subtotal < v.MinPurchaseAmount {
		return &domain.ValidateVoucherResponse{
			Valid:   false,
			Message: fmt.Sprintf("Minimum belanja untuk voucher ini adalah Rp %.0f (subtotal saat ini: Rp %.0f)", v.MinPurchaseAmount, req.Subtotal),
			Voucher: v,
		}, nil
	}

	// Check customer tier restriction if configured
	if v.MinMembershipTier != nil && *v.MinMembershipTier != "" {
		requiredTier := *v.MinMembershipTier
		if req.CustomerID == nil {
			return &domain.ValidateVoucherResponse{
				Valid:   false,
				Message: fmt.Sprintf("Voucher ini khusus member dengan tier minimum %s. Silakan pilih pelanggan terlebih dahulu.", requiredTier),
				Voucher: v,
			}, nil
		}

		cust, err := u.repo.GetCustomerByID(ctx, actor.TenantID, *req.CustomerID)
		if err != nil || cust == nil {
			return &domain.ValidateVoucherResponse{
				Valid:   false,
				Message: "Data pelanggan member tidak ditemukan",
				Voucher: v,
			}, nil
		}

		if tierWeight(cust.MembershipTier) < tierWeight(requiredTier) {
			return &domain.ValidateVoucherResponse{
				Valid:   false,
				Message: fmt.Sprintf("Voucher ini khusus member tier %s ke atas. Tier pelanggan saat ini: %s.", requiredTier, cust.MembershipTier),
				Voucher: v,
			}, nil
		}
	}

	// Calculate discount amount
	var discount float64
	if v.DiscountType == domain.DiscountTypePercentage {
		discount = req.Subtotal * (v.DiscountValue / 100.0)
		if v.MaxDiscountAmount != nil && *v.MaxDiscountAmount > 0 {
			if discount > *v.MaxDiscountAmount {
				discount = *v.MaxDiscountAmount
			}
		}
	} else {
		// FIXED_AMOUNT
		discount = v.DiscountValue
		if discount > req.Subtotal {
			discount = req.Subtotal
		}
	}

	discount = math.Round(discount)

	return &domain.ValidateVoucherResponse{
		Valid:          true,
		DiscountAmount: discount,
		Message:        fmt.Sprintf("Voucher '%s' berhasil digunakan (Hemat Rp %.0f)", v.Code, discount),
		Voucher:        v,
	}, nil
}
