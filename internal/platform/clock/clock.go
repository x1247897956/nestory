package clock

import "time"

func Now() int64 { return time.Now().UTC().UnixMilli() }
