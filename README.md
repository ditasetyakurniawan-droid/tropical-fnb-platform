# Tropical F&B Platform

Enterprise Restaurant & F&B Operations Platform designed for multi-branch casual and fine dining management.

## Architecture Highlights
- **Architecture**: Modular Monolith (ADR 0001) in Go 1.24 + PostgreSQL 18 + React 19 SPA.
- **Enterprise Standards**: USALI (Uniform System of Accounts for the Lodging Industry), standard Integer IDR, Native UUIDv7.
- **Business Modules**:
  1. `iam`: Multi-tenant RBAC, Supervisor Overrides, PIN authorization.
  2. `pos`: Table Floor Plans, Order Taking, Modifiers, Split-Bill, Cashier Shift Management.
  3. `kds`: Real-time Kitchen Display System with course pacing.
  4. `inventory`: Recipe BOMs, Butchering Yield Tests, Multi-Warehouse, Inter-Branch Transfers.
  5. `sop`: Digital Opening/Closing Checklists, Quality Audits & Corrective Action Items.
  6. `payroll`: Attendance kiosk, Shift definitions, Kasbon advances, Slip gaji generation.
  7. `crm`: Customer Loyalty points, Vouchers, Table Reservations with Down Payment.
  8. `finance`: USALI Financial P&L, Operating Expenses, Daily Cashier Reconciliation.

## CI/CD & Production Topology
- **CI Engine**: Jenkins on-premises (`jenkins-dt: 192.168.100.57`).
- **Code Quality & Security**: SonarQube (`ELK-sonar: 192.168.100.59`) + Trivy container scanner.
- **Container Registry**: Self-hosted Harbor (`harbor-dt.co.id: 192.168.100.58`).
  - Backend: `harbor-dt.co.id/devops-apps/tropical-fnb-backend:${VERSION}-${GIT_SHORT_SHA}`
  - Frontend: `harbor-dt.co.id/devops-apps/tropical-fnb-frontend:${VERSION}-${GIT_SHORT_SHA}`
- **GitOps CD**: ArgoCD reconciling from [tropical-fnb-platform-gitops](https://github.com/ditasetyakurniawan-droid/tropical-fnb-platform-gitops).
- **Dedicated Database**: PostgreSQL 18 on dedicated node `192.168.100.70` (Node `DB-dt`).

## Local Development
```bash
# Start backend and frontend locally
./start.sh

# Run unit tests
cd backend && go test ./...
cd ../frontend && npm test
```
