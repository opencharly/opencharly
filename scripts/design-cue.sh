#!/usr/bin/env bash
# design-cue.sh — print the path of a CUE v0.18.0-rc.1 binary (DESIGN.md Appendix A).
#
# Uses `cue` from PATH only when `cue version` reports exactly v0.18.0-rc.1. Otherwise fetches the
# release archive into $XDG_CACHE_HOME/charly/tool/cue/v0.18.0-rc.1/, verifies its sha256 against the
# pinned table below (the digests GitHub publishes for the release assets), and unpacks it.
# Any mismatch fails; there is no fallback to another version.
set -euo pipefail

readonly VERSION=v0.18.0-rc.1
declare -A SHA256=(
	[linux_amd64]=213b416b0f0bebb0e35e032988d8876187f935ccd8773526d6819bd9346fa104
	[linux_arm64]=d7e6bad893a129bff380a32ab35a8599f2845ed407c5dbaea41bf6fc9f2f22ed
	[darwin_amd64]=93bc8fc541726f89cf21be7f7b0376a35c6b4ff98ebf78b4ba0fe1e2925543ad
	[darwin_arm64]=1c122f75a7b19c0f4ff8871a81df9271c558c52f1ad3a9cdf01983174dd003f7
)

die() { echo "design-cue: $*" >&2; exit 1; }

case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) die "unsupported OS $(uname -s)" ;; esac
case "$(uname -m)" in x86_64 | amd64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) die "unsupported CPU $(uname -m)" ;; esac
platform="${os}_${arch}"
dir="${XDG_CACHE_HOME:-$HOME/.cache}/charly/tool/cue/$VERSION"
mkdir -p "$dir/$platform"

if command -v cue >/dev/null 2>&1 && [[ "$(cue version 2>/dev/null | sed -n '1s/^cue version //p')" == "$VERSION" ]]; then
	command -v cue
	exit 0
fi

want="${SHA256[$platform]:-}"
[[ -n "$want" ]] || die "no pinned digest for $platform"
bin="$dir/$platform/cue"
if [[ ! -x "$bin" ]]; then
	archive="cue_${VERSION}_${platform}.tar.gz"
	tmp="$(mktemp -d "$dir/.fetch.XXXXXX")"
	trap 'rm -rf "$tmp"' EXIT
	curl -fsSL -o "$tmp/$archive" "https://github.com/cue-lang/cue/releases/download/$VERSION/$archive" ||
		die "download of $archive failed"
	got="$(sha256sum "$tmp/$archive" 2>/dev/null || shasum -a 256 "$tmp/$archive")"
	got="${got%% *}"
	[[ "$got" == "$want" ]] || die "$archive: sha256 $got, want $want"
	tar -xzf "$tmp/$archive" -C "$tmp" cue
	[[ "$("$tmp/cue" version | sed -n '1s/^cue version //p')" == "$VERSION" ]] ||
		die "unpacked binary does not report $VERSION"
	mv "$tmp/cue" "$bin" # atomic publish into the cache
fi
echo "$bin"
