package app_test

import (
	"testing"

	"noteapp/internal/platform/buildinfo"
)

func TestConfigReportsBuildVersion(t *testing.T) {
	original := buildinfo.Version
	t.Cleanup(func() { buildinfo.Version = original })
	for _, tc := range []struct {
		name    string
		version string
	}{
		{name: "development", version: "development"},
		{name: "commit", version: "9f5e899"},
		{name: "release tag", version: "v0.1.1+9f5e899"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			buildinfo.Version = tc.version
			h, closeDB := setup(t)
			defer closeDB()
			got := req(t, h, "GET", "/config", nil, 200)
			if got["version"] != tc.version {
				t.Fatalf("version = %v, want %q", got["version"], tc.version)
			}
		})
	}
}
