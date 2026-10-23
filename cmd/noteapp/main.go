package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"noteapp/internal/app"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/database"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("shutdown", "error", err)
		os.Exit(1)
	}
}
func run() error {
	c, err := config.Load()
	if err != nil {
		return err
	}
	if err = os.MkdirAll(c.DataDir, 0750); err != nil {
		return err
	}
	db, err := database.Open(context.Background(), filepath.Join(c.DataDir, "noteapp.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	srv := &http.Server{Addr: c.Addr, Handler: app.New(db, c), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { slog.Info("listening", "addr", c.Addr); done <- srv.ListenAndServe() }()
	select {
	case err = <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}
