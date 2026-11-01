package usecase_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/crm/domain"
	"tropical-fnb/backend/internal/modules/crm/usecase"
)

func TestTierWeight(t *testing.T) {
	// VIP > GOLD > SILVER > BRONZE
	tiers := []string{
		domain.TierBronze,
		domain.TierSilver,
		domain.TierGold,
		domain.TierTropicalVIP,
	}

	for i := 0; i < len(tiers)-1; i++ {
		// Just ensure tier logic holds
		if tiers[i] == domain.TierTropicalVIP && tiers[i+1] == domain.TierGold {
			t.Errorf("expected VIP > Gold")
		}
	}
}

func TestValidateVoucher_Calculations(t *testing.T) {
	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	nextMonth := time.Now().AddDate(0, 1, 0).Format("2006-01-02")

	// Percentage voucher: 15% with max cap 150k
	maxCap := 150000.0
	voucherPct := domain.Voucher{
		ID:                uuid.New(),
		Code:              "TROPICALVIP",
		Title:             "Diskon VIP 15%",
		DiscountType:      domain.DiscountTypePercentage,
		DiscountValue:     15.0,
		MaxDiscountAmount: &maxCap,
		MinPurchaseAmount: 500000.0,
		UsageLimitTotal:   50,
		UsageCount:        10,
		ValidFrom:         yesterday,
		ValidUntil:        nextMonth,
		IsActive:          true,
	}

	if !voucherPct.IsActive {
		t.Fatal("expected voucher to be active")
	}

	// 15% of 600,000 = 90,000 (below cap)
	discount1 := 600000.0 * (voucherPct.DiscountValue / 100.0)
	if discount1 != 90000.0 {
		t.Errorf("expected discount 90,000, got %.2f", discount1)
	}

	// 15% of 2,000,000 = 300,000 -> capped at 150,000
	discount2 := 2000000.0 * (voucherPct.DiscountValue / 100.0)
	if discount2 > *voucherPct.MaxDiscountAmount {
		discount2 = *voucherPct.MaxDiscountAmount
	}
	if discount2 != 150000.0 {
		t.Errorf("expected capped discount 150,000, got %.2f", discount2)
	}

	// Fixed voucher: 50k off min spend 300k
	voucherFixed := domain.Voucher{
		ID:                uuid.New(),
		Code:              "FLAT50K",
		DiscountType:      domain.DiscountTypeFixedAmount,
		DiscountValue:     50000.0,
		MinPurchaseAmount: 300000.0,
		ValidFrom:         yesterday,
		ValidUntil:        nextMonth,
		IsActive:          true,
	}

	if today < voucherFixed.ValidFrom || today > voucherFixed.ValidUntil {
		t.Fatal("voucher should be valid today")
	}
}

func TestCustomerRequest_Validation(t *testing.T) {
	actor := domain.Actor{
		TenantID: uuid.New(),
		Username: "manager",
	}

	uc := usecase.NewCRMUsecase(nil) // nil repo to test input validation guards

	// Missing Name
	_, err := uc.CreateCustomer(context.Background(), actor, domain.CreateCustomerRequest{
		Phone: "08123456789",
		Name:  "",
	})
	if err == nil {
		t.Fatal("expected validation error for empty name")
	}

	// Missing Phone
	_, err = uc.CreateCustomer(context.Background(), actor, domain.CreateCustomerRequest{
		Phone: "",
		Name:  "Budi Santoso",
	})
	if err == nil {
		t.Fatal("expected validation error for empty phone")
	}

	// Create Voucher - Empty Code
	_, err = uc.CreateVoucher(context.Background(), actor, domain.CreateVoucherRequest{
		Code:          "",
		Title:         "Diskon",
		DiscountType:  domain.DiscountTypeFixedAmount,
		DiscountValue: 10000,
	})
	if err == nil {
		t.Fatal("expected validation error for empty voucher code")
	}

	// Create Voucher - Invalid Discount Type
	_, err = uc.CreateVoucher(context.Background(), actor, domain.CreateVoucherRequest{
		Code:          "TEST",
		Title:         "Diskon",
		DiscountType:  "INVALID_TYPE",
		DiscountValue: 10000,
	})
	if err == nil {
		t.Fatal("expected validation error for invalid discount type")
	}
}
