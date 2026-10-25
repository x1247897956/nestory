package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
	_ "time/tzdata"
)

type Config struct {
	UploadLimit  int64
	Addr         string
	DataDir      string
	Timezone     string
	DevOrigin    string
	AllowedHosts []string
}

func Load() (Config, error) {
	c := Config{Addr: env("APP_ADDR", "127.0.0.1:8080"), DataDir: env("APP_DATA_DIR", "./data"), Timezone: env("APP_TIMEZONE", "Asia/Shanghai"), DevOrigin: os.Getenv("APP_DEV_ORIGIN")}
	var err error
	c.AllowedHosts, err = ParseAllowedHosts(env("APP_ALLOWED_HOSTS", "localhost,127.0.0.1,::1"))
	if err != nil {
		return c, err
	}
	c.UploadLimit = 20 << 20
	if raw := os.Getenv("APP_UPLOAD_LIMIT"); raw != "" {
		n, e := strconv.ParseInt(raw, 10, 64)
		if e != nil || n < 1 {
			return c, fmt.Errorf("APP_UPLOAD_LIMIT 必须为正整数字节数")
		}
		c.UploadLimit = n
	}
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
