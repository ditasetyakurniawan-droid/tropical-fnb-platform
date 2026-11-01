SHELL := /bin/bash
.DEFAULT_GOAL := help

# Go is installed at /usr/local/go/bin on this machine but may not be on PATH.
export PATH := $(PATH):/usr/local/go/bin

COMPOSE   ?= docker compose
BACKEND   := backend
FRONTEND  := frontend
VERSION   ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
LDFLAGS   := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT)

# Load .env (if present) so `make run-api` / `make migrate-up` see DATABASE_URL.
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help
help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ---------------------------------------------------------------- local env
.PHONY: env
env: ## Create .env from .env.example (if missing)
	@test -f .env || (cp .env.example .env && echo "created .env")

.PHONY: db-up
db-up: env ## Start local PostgreSQL 18
	$(COMPOSE) up -d --wait postgres

.PHONY: db-down
db-down: ## Stop local PostgreSQL (data kept)
	$(COMPOSE) down

.PHONY: db-reset
db-reset: ## DESTROY local database volume and recreate it
	$(COMPOSE) down -v
	$(MAKE) db-up migrate-up

.PHONY: psql
psql: ## Open psql inside the local Postgres container
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-tropical} -d $${POSTGRES_DB:-tropical_fnb}

## ------------------------------------------------------------------ backend
.PHONY: migrate-up migrate-down migrate-status
migrate-up: ## Apply pending migrations
	cd $(BACKEND) && go run ./cmd/migrate up
migrate-down: ## Roll back the last migration
	cd $(BACKEND) && go run ./cmd/migrate down
migrate-status: ## Show migration status
	cd $(BACKEND) && go run ./cmd/migrate status

.PHONY: run-api
run-api: ## Run the API locally (needs `make db-up migrate-up`)
	cd $(BACKEND) && go run -ldflags "$(LDFLAGS)" ./cmd/api

.PHONY: build-api
build-api: ## Build static API + migrate binaries into backend/bin
	cd $(BACKEND) && CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/api ./cmd/api
	cd $(BACKEND) && CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/migrate ./cmd/migrate

.PHONY: test-api
test-api: ## Backend unit tests with the race detector
	cd $(BACKEND) && go test -race -count=1 ./...

.PHONY: lint-api
lint-api: ## gofmt + go vet
	@test -z "$$(cd $(BACKEND) && gofmt -l .)" || (cd $(BACKEND) && gofmt -l . && echo "^ run gofmt -w" && exit 1)
	cd $(BACKEND) && go vet ./...

## ----------------------------------------------------------------- frontend
.PHONY: fe-install fe-dev fe-build fe-test fe-lint
fe-install: ## Install frontend dependencies (reproducible)
	cd $(FRONTEND) && npm ci
fe-dev: ## Run the Vite dev server
	cd $(FRONTEND) && npm run dev
fe-build: ## Typecheck + production build
	cd $(FRONTEND) && npm run build
fe-test: ## Frontend unit tests
	cd $(FRONTEND) && npm test
fe-lint: ## ESLint + typecheck
	cd $(FRONTEND) && npm run lint && npm run typecheck

## ---------------------------------------------------------------- container
.PHONY: docker-build
docker-build: ## Build backend and frontend images locally
	docker build -t tropical-fnb/backend:$(VERSION) --build-arg VERSION=$(VERSION) --build-arg COMMIT=$(COMMIT) $(BACKEND)
	docker build -t tropical-fnb/frontend:$(VERSION) $(FRONTEND)

## --------------------------------------------------------------------- helm
HELM_CHART := deploy/helm/tropical-fnb
.PHONY: helm-lint helm-template
helm-lint: ## Lint the Helm chart
	helm lint $(HELM_CHART)
helm-template: ## Render the chart to stdout
	helm template tropical-fnb $(HELM_CHART)

## ------------------------------------------------------------------ quality
.PHONY: check
check: lint-api test-api fe-lint fe-test helm-lint ## Everything CI should run
