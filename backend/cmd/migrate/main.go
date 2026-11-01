// Command migrate applies database schema migrations (embedded in the binary).
//
// Usage:
//
//	migrate up        apply all pending migrations
//	migrate down      roll back the most recent migration
//	migrate status    show applied / pending migrations
//	migrate version   print the current schema version
//
// It reads DATABASE_URL from the environment, exactly like the API, so the same
// image runs as a Helm pre-install/pre-upgrade Job.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"tropical-fnb/backend/migrations"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 1 {
		return errors.New("usage: migrate <up|down|status|version>")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return errors.New("DATABASE_URL is required but not set")
	}

	connCfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return errors.New("DATABASE_URL could not be parsed")
	}
	db := stdlib.OpenDB(*connCfg)
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.FS)
	if err != nil {
		return fmt.Errorf("init goose: %w", err)
	}
	return execute(ctx, provider, db, args[0])
}

func execute(ctx context.Context, p *goose.Provider, db *sql.DB, cmd string) error {
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("cannot reach database: %w", err)
	}
	switch cmd {
	case "up":
		results, err := p.Up(ctx)
		if err != nil {
			return err
		}
		if len(results) == 0 {
			fmt.Println("schema is up to date")
		}
		for _, r := range results {
			fmt.Printf("applied  %s (%s)\n", r.Source.Path, r.Duration)
		}
	case "down":
		r, err := p.Down(ctx)
		if err != nil {
			return err
		}
		fmt.Printf("reverted %s (%s)\n", r.Source.Path, r.Duration)
	case "status":
		statuses, err := p.Status(ctx)
		if err != nil {
			return err
		}
		for _, s := range statuses {
			fmt.Printf("%-9s %s\n", s.State, s.Source.Path)
		}
	case "version":
		v, err := p.GetDBVersion(ctx)
		if err != nil {
			return err
		}
		fmt.Println(v)
	default:
		return fmt.Errorf("unknown command %q (expected up|down|status|version)", cmd)
	}
	return nil
}
