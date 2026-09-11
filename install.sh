#!/bin/sh
set -eu

GITHUB_REPO='MaksSt/forkop-analyzer'
DEFAULT_VERSION='v0.2.0'
PACKAGE_VERSION='0.2.0'
PACKAGE_RELEASE='1'
BACKEND_ASSET="forkop-analyzer-${PACKAGE_VERSION}-r${PACKAGE_RELEASE}.apk"
LUCI_ASSET="luci-app-forkop-analyzer-${PACKAGE_VERSION}-r${PACKAGE_RELEASE}.apk"

REQUESTED_VERSION=''
ALLOW_PRERELEASE=0
NO_START=0
UNINSTALL=0
TMP_DIR=''

usage() {
	cat <<'EOF'
Usage: install.sh [OPTIONS]

Install Forkop Analyzer on OpenWrt with apk.

Options:
  --version TAG   Install a specific release tag, for example v0.2.0
  --prerelease    Allow the newest release, including a prerelease
  --no-start      Install packages without restarting services
  --uninstall     Remove Forkop Analyzer packages
  --help          Show this help
EOF
}

fail() {
	printf 'Error: %s\n' "$1" >&2
	exit 1
}

cleanup() {
	[ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ] && rm -rf -- "$TMP_DIR"
}

trap cleanup EXIT INT TERM

while [ "$#" -gt 0 ]; do
	case "$1" in
		--version)
			[ "$#" -ge 2 ] || fail '--version requires a tag'
			REQUESTED_VERSION="$2"
			shift 2
		;;
		--prerelease)
			ALLOW_PRERELEASE=1
			shift
		;;
		--no-start)
			NO_START=1
			shift
		;;
		--uninstall)
			UNINSTALL=1
			shift
		;;
		--help|-h)
			usage
			exit 0
		;;
		*)
			fail "unknown option: $1"
		;;
	esac
done

[ -r /etc/openwrt_release ] || fail 'OpenWrt was not detected'
command -v apk >/dev/null 2>&1 || fail 'apk is required; opkg-only systems are not supported'

openwrt_release="$(sed -n "s/^DISTRIB_RELEASE=['\"]\([^'\"]*\)['\"]$/\1/p" /etc/openwrt_release | sed -n '1p')"
case "$openwrt_release" in
	25.12.*) ;;
	*) fail "unsupported OpenWrt release: ${openwrt_release:-unknown}; expected 25.12.x" ;;
esac

if [ "$UNINSTALL" -eq 1 ]; then
	[ "$NO_START" -eq 1 ] || /etc/init.d/forkop-analyzer stop >/dev/null 2>&1 || true
	apk del luci-app-forkop-analyzer forkop-analyzer
	[ "$NO_START" -eq 1 ] || /etc/init.d/rpcd restart >/dev/null 2>&1 || true
	printf 'Forkop Analyzer was removed. Forkop and sing-box were not changed.\n'
	exit 0
fi

[ -x /usr/bin/forkop ] || fail 'Forkop is not installed'
command -v wget >/dev/null 2>&1 || fail 'wget is required'
command -v sha256sum >/dev/null 2>&1 || fail 'sha256sum is required'
command -v jsonfilter >/dev/null 2>&1 || fail 'jsonfilter is required'

TMP_DIR="$(mktemp -d /tmp/forkop-analyzer-install.XXXXXX)"
chmod 700 "$TMP_DIR"

release_tag="$REQUESTED_VERSION"
if [ -z "$release_tag" ]; then
	if [ "$ALLOW_PRERELEASE" -eq 1 ]; then
		release_api="https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=1"
	else
		release_api="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
	fi
	wget -q -O "$TMP_DIR/release.json" "$release_api" || fail 'unable to query GitHub Releases'
	if command -v jsonfilter >/dev/null 2>&1; then
		if [ "$ALLOW_PRERELEASE" -eq 1 ]; then
			release_tag="$(jsonfilter -q -i "$TMP_DIR/release.json" -e '@[0].tag_name')"
		else
			release_tag="$(jsonfilter -q -i "$TMP_DIR/release.json" -e '@.tag_name')"
		fi
	else
		release_tag="$(sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' "$TMP_DIR/release.json" | sed -n '1p')"
	fi
fi

case "$release_tag" in
	v[0-9]*.[0-9]*.[0-9]* ) ;;
	*) fail 'GitHub returned an invalid release tag' ;;
esac

if [ "$release_tag" != "$DEFAULT_VERSION" ]; then
	version_without_v="${release_tag#v}"
	BACKEND_ASSET="forkop-analyzer-${version_without_v}-r${PACKAGE_RELEASE}.apk"
	LUCI_ASSET="luci-app-forkop-analyzer-${version_without_v}-r${PACKAGE_RELEASE}.apk"
fi

release_base="https://github.com/${GITHUB_REPO}/releases/download/${release_tag}"
for asset in "$BACKEND_ASSET" "$LUCI_ASSET" SHA256SUMS; do
	printf 'Downloading %s...\n' "$asset"
	wget -O "$TMP_DIR/$asset" "$release_base/$asset" || fail "unable to download $asset"
done

grep "  $BACKEND_ASSET\$" "$TMP_DIR/SHA256SUMS" > "$TMP_DIR/SHA256SUMS.selected" || fail 'backend checksum is missing'
grep "  $LUCI_ASSET\$" "$TMP_DIR/SHA256SUMS" >> "$TMP_DIR/SHA256SUMS.selected" || fail 'LuCI checksum is missing'
(
	cd "$TMP_DIR"
	sha256sum -c SHA256SUMS.selected
) || fail 'SHA-256 verification failed'

for package in "$TMP_DIR/$BACKEND_ASSET" "$TMP_DIR/$LUCI_ASSET"; do
	apk adbdump --format json "$package" > "$TMP_DIR/package-metadata.json" \
		|| fail "unable to read package metadata: $package"
	package_arch="$(jsonfilter -q -i "$TMP_DIR/package-metadata.json" -e '@.info.arch')"
	case "$package_arch" in
		all|noarch) ;;
		'') fail "unable to read package architecture: $package" ;;
		*) fail "unsupported architecture '$package_arch' in $package" ;;
	esac
done

apk add --allow-untrusted "$TMP_DIR/$BACKEND_ASSET" "$TMP_DIR/$LUCI_ASSET"

if [ "$NO_START" -eq 0 ]; then
	/etc/init.d/forkop-analyzer enable
	/etc/init.d/forkop-analyzer restart
	/etc/init.d/rpcd restart
fi

lan_ip=''
if command -v ubus >/dev/null 2>&1 && command -v jsonfilter >/dev/null 2>&1; then
	lan_ip="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -q -e '@["ipv4-address"][0].address')"
fi
[ -n "$lan_ip" ] || lan_ip='openwrt.lan'

printf 'Forkop Analyzer %s installed successfully.\n' "$release_tag"
printf 'LuCI: http://%s/cgi-bin/luci/admin/services/forkop-analyzer\n' "$lan_ip"
