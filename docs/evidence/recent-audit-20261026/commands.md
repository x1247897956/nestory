# 复现命令

前端：`npm test --prefix web -- --run`；`npm run build --prefix web`；`npm audit --prefix web --json`。

本机Go工具链缓存命令：

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=go1.27.3 /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race -count=1 ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=go1.27.3 /Users/seyr1n/.goenv/versions/1.25.12/bin/go vet ./...
env -u GOROOT PATH=/tmp/noteapp-go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.darwin-arm64/bin:/usr/bin:/bin:/opt/homebrew/bin GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=local GOOS=linux GOARCH=arm64 CGO_ENABLED=0 /tmp/noteapp-release-audit/bin/govulncheck ./...
```

完整浏览器：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:recent-audit-20261026
```

镜像构建、运维与演练命令见审计报告。宿主路径是本次执行环境；在另一台机器上用已安装Go1.27.3和govulncheck1.9.0替换路径即可。
