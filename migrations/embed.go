package migrations

import _ "embed"

//go:embed 001_core.sql
var Core string

//go:embed 002_pages_assets.sql
var PagesAssets string

//go:embed 003_events_relations.sql
var EventsRelations string

//go:embed 004_workspace_trash.sql
var WorkspaceTrash string

//go:embed 005_project_actions.sql
var ProjectActions string

//go:embed 006_block_documents.sql
var BlockDocuments string

//go:embed 008_creation_requests.sql
var CreationRequests string
