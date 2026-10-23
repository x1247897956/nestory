package config

import (
	"fmt"
	"os"
	"time"
	_ "time/tzdata"
)

type Config struct {
	Addr      string
	DataDir   string
	Timezone  string
	DevOrigin string
}

func Load() (Config, error) {
	c := Config{Addr: env("APP_ADDR", ":8080"), DataDir: env("APP_DATA_DIR", "./data"), Timezone: env("APP_TIMEZONE", "Asia/Shanghai"), DevOrigin: os.Getenv("APP_DEV_ORIGIN")}
	if _, err := time.LoadLocation(c.Timezone); err != nil {
		return c, fmt.Errorf("APP_TIMEZONE: %w", err)
	}
	return c, nil
}
func env(k, d string) string {
	if s := os.Getenv(k); s != "" {
		return s
	}
	return d
}
