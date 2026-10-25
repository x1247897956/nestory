package app

import (
	"net/http"
	"net/url"
	"noteapp/internal/platform/config"
)

func allowedRequestHost(authority string, hosts []string) bool {
	host, _, err := config.NormalizeAuthority(authority)
	if err != nil {
		return false
	}
	if hosts == nil {
		hosts = config.DefaultAllowedHosts
	}
	for _, entry := range hosts {
		normalized, e := config.NormalizeHost(entry)
		if e == nil && normalized == host {
			return true
		}
	}
	return false
}

func originAuthority(origin string) (string, string, string, bool) {
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || u.Opaque != "" || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", "", "", false
	}
	host, port, err := config.NormalizeAuthority(u.Host)
	if err != nil {
		return "", "", "", false
	}
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	return u.Scheme, host, port, true
}
func allowedOrigin(origin string, r *http.Request, devOrigin string) bool {
	scheme, host, port, ok := originAuthority(origin)
	if !ok {
		return false
	}
	if devOrigin != "" {
		ds, dh, dp, valid := originAuthority(devOrigin)
		if valid && scheme == ds && host == dh && port == dp {
			return true
		}
	}
	actualScheme := "http"
	if r.TLS != nil {
		actualScheme = "https"
	}
	rs, rh, rp, valid := originAuthority(actualScheme + "://" + r.Host)
	return valid && scheme == rs && host == rh && port == rp
}
