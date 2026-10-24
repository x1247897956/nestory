package workspace

import (
	"noteapp/internal/taskmeta"
	"strings"
)

// Build the predicate from the same terminal semantics used by task metadata.
func openTaskStages() (string, []any) {
	placeholders := []string{}
	args := []any{}
	for _, stage := range taskmeta.Stages() {
		if stage.Terminal {
			placeholders = append(placeholders, "?")
			args = append(args, stage.ID)
		}
	}
	if len(args) == 0 {
		return "1=1", args
	}
	return "t.stage NOT IN (" + strings.Join(placeholders, ",") + ")", args
}
