// Package buildinfo holds metadata injected when the application is compiled.
package buildinfo

// Version is set by the linker from APP_VERSION during an image build.
// Plain go run/go build keeps the development marker.
var Version = "development"
