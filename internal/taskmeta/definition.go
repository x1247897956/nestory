// Package taskmeta owns the fixed task defaults, allowed values and terminal semantics.
package taskmeta

const DefaultStage = "todo"
const DefaultPriority = "none"

type Option struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Stage struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Terminal bool   `json:"terminal"`
}

func Stages() []Stage {
	return []Stage{{DefaultStage, "Todo", false}, {"in_plan", "InPlan", false}, {"in_process", "InProcess", false}, {"done", "Done", true}, {"cancelled", "Cancelled", true}}
}
func Priorities() []Option {
	return []Option{{DefaultPriority, "未设置"}, {"low", "低"}, {"medium", "中"}, {"high", "高"}}
}
func ValidStage(value string) bool {
	for _, s := range Stages() {
		if s.ID == value {
			return true
		}
	}
	return false
}
func ValidPriority(value string) bool {
	for _, p := range Priorities() {
		if p.ID == value {
			return true
		}
	}
	return false
}
func StageOptions() []Option {
	out := []Option{}
	for _, s := range Stages() {
		out = append(out, Option{s.ID, s.Name})
	}
	return out
}
