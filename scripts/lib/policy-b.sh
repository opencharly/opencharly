# policy-b.sh — the ONE definition of policy B's charly-pinned set (sourced, not run).
#
# Policy B (README, AGENTS.md rule 6): the umbrella's distro-* gitlinks must equal
# charly's own box/* gitlinks. This map is the contract; it had been copy-pasted into
# both verify-pins.sh and sync-gitlinks.sh, which is exactly the duplication R3
# forbids — one canonical definition, every caller sources it.
#
# NOT charly-pinned, deliberately: sdk and spec resolve from the Go proxy at pinned
# go.mod requires since their de-submodule cutovers; docs pins charly in ITS OWN
# .gitmodules; the plugins corpus moved to the standalone opencharly/marketplace repo.
# Those follow the every-other-repo rule (their own default-branch HEAD).

# charly-path -> umbrella-path
declare -A CHARLY_PINNED=(
  [box/arch]=distro-arch
  [box/cachyos]=distro-cachyos
  [box/debian]=distro-debian
  [box/fedora]=distro-fedora
  [box/omarchy]=distro-omarchy
  [box/ubuntu]=distro-ubuntu
)
