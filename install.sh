#!/bin/sh
# vibeco CLI installer.
# Downloads the latest release binary from https://github.com/vibe-ad/vibe-cli,
# verifies its SHA256, and installs it to $HOME/.vibeco/bin/vibeco.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vibe-ad/vibe-cli/main/install.sh | sh

set -eu

REPO="vibe-ad/vibe-cli"
INSTALL_DIR="${VIBECO_INSTALL_DIR:-$HOME/.vibeco/bin}"
NO_MODIFY_PATH=0

usage() {
  cat <<EOF
Usage: install.sh [--no-modify-path]

Options:
  --no-modify-path   Skip appending to shell rc files.
  -h, --help         Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-modify-path) NO_MODIFY_PATH=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "vibeco: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

UNAME_S=$(uname -s)
UNAME_M=$(uname -m)
case "$UNAME_S" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "vibeco: unsupported OS: $UNAME_S" >&2; exit 1 ;;
esac
case "$UNAME_M" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) echo "vibeco: unsupported arch: $UNAME_M" >&2; exit 1 ;;
esac
ASSET="vibeco-${OS}-${ARCH}"

TMP=$(mktemp -d 2>/dev/null || mktemp -d -t vibeco-install)
trap 'rm -rf "$TMP"' EXIT INT TERM

# Prefer gh when available: it resolves the release tag explicitly and downloads
# with the user's cached auth. Fall back to unauthenticated curl.
if command -v gh >/dev/null 2>&1; then
  TAG=$(gh release view --repo "$REPO" --json tagName -q .tagName)
  echo "vibeco: downloading $ASSET ($TAG) via gh..." >&2
  gh release download "$TAG" --repo "$REPO" \
    --pattern "$ASSET" --pattern SHA256SUMS -D "$TMP"
elif command -v curl >/dev/null 2>&1; then
  BASE="https://github.com/$REPO/releases/latest/download"
  echo "vibeco: downloading $ASSET (latest) via curl..." >&2
  curl -fsSL -o "$TMP/$ASSET" "$BASE/$ASSET"
  curl -fsSL -o "$TMP/SHA256SUMS" "$BASE/SHA256SUMS"
else
  echo "vibeco: install requires curl or gh" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL=$(sha256sum "$TMP/$ASSET" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL=$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')
else
  echo "vibeco: install requires sha256sum or shasum" >&2
  exit 1
fi

# `sha256sum -b` prefixes the name with `*`; tolerate both formats.
EXPECTED=$(awk -v n="$ASSET" '$2==n||$2=="*"n{print $1}' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ]; then
  echo "vibeco: SHA256SUMS has no entry for $ASSET" >&2
  exit 1
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "vibeco: checksum mismatch for $ASSET (expected $EXPECTED, got $ACTUAL)" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
mv "$TMP/$ASSET" "$INSTALL_DIR/vibeco"
chmod +x "$INSTALL_DIR/vibeco"
echo "vibeco: installed to $INSTALL_DIR/vibeco" >&2

if [ "$NO_MODIFY_PATH" -eq 0 ]; then
  case "${SHELL:-}" in
    */zsh) RC="$HOME/.zshrc" ;;
    */bash)
      if [ -f "$HOME/.bashrc" ]; then RC="$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then RC="$HOME/.bash_profile"
      else RC="$HOME/.bashrc"
      fi
      ;;
    *) RC="" ;;
  esac
  if [ -n "$RC" ]; then
    if [ ! -f "$RC" ] || ! grep -qF "$INSTALL_DIR" "$RC"; then
      {
        echo ""
        echo "# Added by the vibeco installer"
        echo "export PATH=\"$INSTALL_DIR:\$PATH\""
      } >> "$RC"
      echo "vibeco: appended PATH to $RC (open a new shell or: source $RC)" >&2
    else
      echo "vibeco: $INSTALL_DIR already referenced in $RC" >&2
    fi
  else
    echo "vibeco: could not detect a shell rc file; add $INSTALL_DIR to PATH manually" >&2
  fi
fi

echo "" >&2
echo "Run: vibeco --help" >&2
