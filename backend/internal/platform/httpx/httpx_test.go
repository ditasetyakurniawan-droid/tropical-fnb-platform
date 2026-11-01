package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tropical-fnb/backend/internal/platform/httpx"
)

type sampleItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func TestNormalizeNilSliceInJSON(t *testing.T) {
	t.Run("nil slice serializes to empty JSON array", func(t *testing.T) {
		var items []sampleItem // nil slice
		rec := httptest.NewRecorder()
		httpx.JSON(rec, http.StatusOK, items)

		body := strings.TrimSpace(rec.Body.String())
		if body != "[]" {
			t.Fatalf("expected '[]', got %q", body)
		}
	})

	t.Run("non-nil slice serializes normally", func(t *testing.T) {
		items := []sampleItem{{ID: "1", Name: "Steak"}}
		rec := httptest.NewRecorder()
		httpx.JSON(rec, http.StatusOK, items)

		body := strings.TrimSpace(rec.Body.String())
		if !strings.Contains(body, `"Steak"`) {
			t.Fatalf("expected body with 'Steak', got %q", body)
		}
	})

	t.Run("non-slice struct serializes normally", func(t *testing.T) {
		item := sampleItem{ID: "1", Name: "Ribeye"}
		rec := httptest.NewRecorder()
		httpx.JSON(rec, http.StatusOK, item)

		body := strings.TrimSpace(rec.Body.String())
		if !strings.Contains(body, `"Ribeye"`) {
			t.Fatalf("expected body with 'Ribeye', got %q", body)
		}
	})
}

func TestEnsureSliceAndNewListResponse(t *testing.T) {
	var nilSlice []string
	res := httpx.EnsureSlice(nilSlice)
	if res == nil || len(res) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", res)
	}

	res2 := httpx.NewListResponse(nilSlice)
	if res2 == nil || len(res2) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", res2)
	}

	rec := httptest.NewRecorder()
	httpx.WriteList(rec, http.StatusOK, nilSlice)
	body := strings.TrimSpace(rec.Body.String())
	if body != "[]" {
		t.Fatalf("expected '[]', got %q", body)
	}
}
