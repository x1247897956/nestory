package config

import "testing"

func TestAllowedHostsConfiguration(t *testing.T) {
	for _, raw := range []string{"", "*.example.com", "http://localhost", "localhost:8080", "[::1]", "localhost,", "foo..bar", "a_b", "::1%lo0"} {
		if _, err := ParseAllowedHosts(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	for _, raw := range []string{"localhost,127.0.0.1,::1", "LAN.Example., 192.168.1.2"} {
		if _, err := ParseAllowedHosts(raw); err != nil {
			t.Errorf("%q: %v", raw, err)
		}
	}
}
func TestRequestAuthorities(t *testing.T) {
	for _, raw := range []string{"localhost:", "localhost:0", "localhost:65536", "localhost:+80", "localhost:abc", "::1", "[localhost]", "[localhost]:80", "user@localhost", "[::1%lo0]:80"} {
		if _, _, err := NormalizeAuthority(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	for _, raw := range []string{"LOCALHOST.:8080", "[::1]", "[::1]:8080", "127.0.0.1:80"} {
		if _, _, err := NormalizeAuthority(raw); err != nil {
			t.Errorf("%q: %v", raw, err)
		}
	}
}
func TestLoadHostDefaultsAndValidation(t *testing.T) {
	t.Setenv("APP_ADDR", "")
	t.Setenv("APP_ALLOWED_HOSTS", "")
	c, err := Load()
	if err != nil || c.Addr != "127.0.0.1:8080" || len(c.AllowedHosts) != 3 {
		t.Fatalf("%+v %v", c, err)
	}
	t.Setenv("APP_ALLOWED_HOSTS", "*")
	if _, err := Load(); err == nil {
		t.Fatal("invalid environment accepted")
	}
}
