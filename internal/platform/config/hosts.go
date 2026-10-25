package config

import (
	"fmt"
	"net"
	"net/netip"
	"strconv"
	"strings"
)

var DefaultAllowedHosts = []string{"localhost", "127.0.0.1", "::1"}

// NormalizeHost accepts exact DNS names and IP addresses, never URLs or wildcards.
// DNS names are case insensitive and may have one trailing root dot.
func NormalizeHost(raw string) (string, error) {
	if ip, err := netip.ParseAddr(raw); err == nil && ip.Zone() == "" {
		return ip.String(), nil
	}
	host := strings.ToLower(strings.TrimSuffix(raw, "."))
	if len(host) == 0 || len(host) > 253 {
		return "", fmt.Errorf("invalid host %q", raw)
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", fmt.Errorf("invalid host %q", raw)
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return "", fmt.Errorf("invalid host %q", raw)
			}
		}
	}
	return host, nil
}

// NormalizeAuthority validates a request Host and returns canonical host and port.
// Brackets are required for IPv6 authorities; optional ports must be 1..65535.
func NormalizeAuthority(raw string) (string, string, error) {
	host, port := raw, ""
	if strings.HasPrefix(raw, "[") || strings.Contains(raw, ":") {
		if strings.HasPrefix(raw, "[") && strings.HasSuffix(raw, "]") {
			host = raw[1 : len(raw)-1]
			if ip, e := netip.ParseAddr(host); e != nil || !ip.Is6() {
				return "", "", fmt.Errorf("invalid IPv6 authority")
			}
		} else {
			var err error
			host, port, err = net.SplitHostPort(raw)
			if err != nil {
				return "", "", err
			}
			for _, c := range port {
				if c < '0' || c > '9' {
					return "", "", fmt.Errorf("invalid port")
				}
			}
			if strings.HasPrefix(raw, "[") {
				ip, e := netip.ParseAddr(host)
				if e != nil || !ip.Is6() {
					return "", "", fmt.Errorf("invalid IPv6 authority")
				}
			}
			n, e := strconv.Atoi(port)
			if e != nil || n < 1 || n > 65535 {
				return "", "", fmt.Errorf("invalid port")
			}
			port = strconv.Itoa(n)
		}
	}
	host, err := NormalizeHost(host)
	return host, port, err
}

func ParseAllowedHosts(raw string) ([]string, error) {
	result := []string{}
	for _, item := range strings.Split(raw, ",") {
		host, err := NormalizeHost(strings.TrimSpace(item))
		if err != nil {
			return nil, fmt.Errorf("APP_ALLOWED_HOSTS: %w", err)
		}
		result = append(result, host)
	}
	return result, nil
}
