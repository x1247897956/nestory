#!/bin/sh
set -eu
ffmpeg -y -i docs/assets/product-tour.mp4 -filter_complex '[0:v]fps=5,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer' -loop 0 docs/assets/product-tour.gif
