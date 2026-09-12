#!/bin/sh
# Keep at most 64 KiB of the decoded body. curl's write error at that boundary is expected.
# Keep the supervisor alive until timeout kills the entire group on cancellation.
trap '' TERM
port="$1"
domain="$2"
prefix="$3"
case "$domain" in
 chatgpt.com|claude.ai) ;;
 *) curl -sS -I -L --max-redirs 3 --proto '=https' --proto-redir '=https' --proxy "socks5h://127.0.0.1:$port" --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code} %{time_total}\n' "https://$domain/" > "$prefix.meta"
    printf '%s\n' "$?" > "$prefix.rc"
    exit 0 ;;
esac
{
 curl -sS -L --max-redirs 3 --proto '=https' --proto-redir '=https' --compressed \
  --proxy "socks5h://127.0.0.1:$port" --connect-timeout 5 --max-time 12 --range 0-65535 \
  -D "$prefix.headers" -w '%{stderr}\n%{http_code} %{time_total}\n' "https://$domain/" 2> "$prefix.meta"
 printf '%s\n' "$?" > "$prefix.rc"
} | head -c 65536 > "$prefix.body"
