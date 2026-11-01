// Package migrations embeds the SQL schema migrations into the binary so the
// migrate command (and the Helm pre-upgrade Job) needs no files on disk.
package migrations

import "embed"

// FS contains every *.sql migration, applied in filename order by goose.
//
//go:embed *.sql
var FS embed.FS
