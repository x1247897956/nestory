package httpx

import (
	"compress/gzip"
	"net/http"
	"strconv"
	"strings"
)

// CompressJSON reduces read-only API transfer size without buffering responses or
// changing object schemas. Files, ranges, writes and existing encodings pass through.
func CompressJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !strings.HasPrefix(r.URL.Path, "/api/v1/") || strings.HasPrefix(r.URL.Path, "/api/v1/assets/") || r.Header.Get("Range") != "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Accept-Encoding")
		if !acceptsGzip(r.Header.Values("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		writer := &jsonGzipWriter{ResponseWriter: w}
		defer func() {
			if writer.gzip != nil {
				_ = writer.gzip.Close()
			}
		}()
		next.ServeHTTP(writer, r)
	})
}
func acceptsGzip(headers []string) bool {
	wildcard := false
	for _, header := range headers {
		for _, item := range strings.Split(header, ",") {
			parts := strings.Split(item, ";")
			encoding := strings.ToLower(strings.TrimSpace(parts[0]))
			quality := 1.0
			for _, param := range parts[1:] {
				key, value, ok := strings.Cut(strings.TrimSpace(param), "=")
				if ok && strings.EqualFold(key, "q") {
					q, err := strconv.ParseFloat(value, 64)
					if err != nil || q < 0 || q > 1 {
						quality = 0
					} else {
						quality = q
					}
				}
			}
			if encoding == "gzip" {
				return quality > 0
			}
			if encoding == "*" {
				wildcard = quality > 0
			}
		}
	}
	return wildcard
}

type jsonGzipWriter struct {
	http.ResponseWriter
	gzip        *gzip.Writer
	wroteHeader bool
}

func (w *jsonGzipWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	if status >= 200 && status != 204 && status != 304 && strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") && w.Header().Get("Content-Encoding") == "" {
		w.Header().Del("Content-Length")
		w.Header().Set("Content-Encoding", "gzip")
		w.gzip, _ = gzip.NewWriterLevel(w.ResponseWriter, gzip.BestSpeed)
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *jsonGzipWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.gzip != nil {
		return w.gzip.Write(p)
	}
	return w.ResponseWriter.Write(p)
}
