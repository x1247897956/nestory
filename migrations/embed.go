package migrations

import _ "embed"

//go:embed 001_core.sql
var Core string

//go:embed 002_pages_assets.sql
var PagesAssets string
