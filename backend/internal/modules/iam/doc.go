// Package iam is the Identity & Access Management module: tenants, outlets,
// users, roles/permissions and the audit trail.
//
// Module layout (identical for every module so any of them can be extracted
// into its own service):
//
//	domain/      entities and the interfaces other layers depend on
//	usecase/     business rules (the only place that orchestrates transactions)
//	repository/  SQL for this module's tables ONLY
//	handler/     HTTP endpoints; implements server.Module
//
// Boundary rule: a module must never query another module's tables or import
// another module's repository/usecase packages. Cross-module calls go through
// interfaces declared in the caller's own domain package.
//
// Schema lives in migrations/00002_iam_core.sql. Authentication and the
// handlers are implemented in the next milestone.
package iam
