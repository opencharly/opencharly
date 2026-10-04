#!/usr/bin/env bash
# design-cue.sh — print the path of a CUE v0.17.1 binary (DESIGN.md Appendix A).
#
# Uses `cue` from PATH only when `cue version` reports exactly v0.17.1. Otherwise fetches the
# release archive into $XDG_CACHE_HOME/charly/tool/cue/v0.17.1/, verifies its sha256 against the
# pinned table below (the digests GitHub publishes for the release assets), and unpacks it.
# Any mismatch fails; there is no fallback to another version.
set -euo pipefail

readonly VERSION=v0.17.1
declare -A SHA256=(
	[linux_amd64]=a39b0c97695069d95d276d99be0f5dbabb081d801bfdc9ba49b76efaf94e2369
	[linux_arm64]=0d729be30d52c952ca38fc9dcb692caa09d8463fa0b64df5781312779183fbcd
	[darwin_amd64]=80aa026c3f47400c7bfc228b3422fd56b7c6c5ea4d70686f8d8f01ced716d3de
	[darwin_arm64]=64921403f012a97f89494c03605db2fbf7d9daa77dc2631819ac4406cb2e8074
)

die() { echo "design-cue: $*" >&2; exit 1; }

if command -v cue >/dev/null 2>&1 && [[ "$(cue version 2>/dev/null | sed -n '1s/^cue version //p')" == "$VERSION" ]]; then
	command -v cue
	exit 0
fi

case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) die "unsupported OS $(uname -s)" ;; esac
case "$(uname -m)" in x86_64 | amd64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) die "unsupported CPU $(uname -m)" ;; esac
platform="${os}_${arch}"
want="${SHA256[$platform]:-}"
[[ -n "$want" ]] || die "no pinned digest for $platform"

dir="${XDG_CACHE_HOME:-$HOME/.cache}/charly/tool/cue/$VERSION"
bin="$dir/$platform/cue"
if [[ -x "$bin" ]]; then
	echo "$bin"
	exit 0
fi

archive="cue_${VERSION}_${platform}.tar.gz"
mkdir -p "$dir"
tmp="$(mktemp -d "$dir/.fetch.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/$archive" "https://github.com/cue-lang/cue/releases/download/$VERSION/$archive" ||
	die "download of $archive failed"
got="$(sha256sum "$tmp/$archive" 2>/dev/null || shasum -a 256 "$tmp/$archive")"
got="${got%% *}"
[[ "$got" == "$want" ]] || die "$archive: sha256 $got, want $want"
mkdir -p "$tmp/$platform"
tar -xzf "$tmp/$archive" -C "$tmp/$platform" cue
[[ "$("$tmp/$platform/cue" version | sed -n '1s/^cue version //p')" == "$VERSION" ]] ||
	die "unpacked binary does not report $VERSION"
rm -rf "${dir:?}/$platform"
mv "$tmp/$platform" "$dir/$platform" # atomic publish into the cache
echo "$bin"
