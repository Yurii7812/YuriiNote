#!/bin/sh
# YuriiNote を、1行で入れる（Linux）:
#   curl -fsSL https://raw.githubusercontent.com/Yurii7812/YuriiNote/main/install/bootstrap.sh | sh
# 本体の install/linux.sh を取ってきて実行するだけ。もう一度実行すると、最新になる（YuriiNote --update も同じ）
set -eu
RAW="${YURIINOTE_SIMPLE_RAW:-https://raw.githubusercontent.com/Yurii7812/YuriiNote/main}"
T=$(mktemp)
curl -fsSL "$RAW/install/linux.sh" -o "$T"
exec sh "$T"
