#!/bin/sh
set -eu
usage='Usage: sh scripts/media/encode-product.sh [zh-CN|en]'
if [ "$#" -gt 1 ]; then echo "$usage" >&2; exit 2; fi
media_language=${1:-zh-CN}
case "$media_language" in
  zh-CN) asset_suffix='' ;;
  en) asset_suffix='/en' ;;
  --help|-h) echo "$usage"; exit 0 ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
repo_dir=$(cd "$(dirname "$0")/../.." && pwd)
asset_dir="$repo_dir/docs/assets$asset_suffix"
ffmpeg -y -i "$asset_dir/product-tour.mp4" -filter_complex '[0:v]fps=5,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer' -loop 0 "$asset_dir/product-tour.gif"
