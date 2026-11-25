#!/bin/sh
# Prepare persistent folders and the SSH key for the Nextion VM, then start the server.
set -e
mkdir -p "$DATA_DIR/projects" "$HOME/.ssh" "$ARDUINO_DIRECTORIES_USER"
chmod 700 "$HOME/.ssh"
# A key mounted at /config/ssh/id_ed25519 (read-only is fine) is copied in with the right permissions.
if [ -f /config/ssh/id_ed25519 ]; then
  cp /config/ssh/id_ed25519 "$HOME/.ssh/id_ed25519"
  [ -f /config/ssh/id_ed25519.pub ] && cp /config/ssh/id_ed25519.pub "$HOME/.ssh/id_ed25519.pub"
fi
# First start without a key: create one, so its public half can be added to the VM.
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "micromanager" -f "$HOME/.ssh/id_ed25519"
  echo "Created an SSH key for the Nextion VM. Add this public key to the VM (see INSTALL-UNRAID.md):"
  cat "$HOME/.ssh/id_ed25519.pub"
fi
chmod 600 "$HOME/.ssh/id_ed25519"
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ ! -d "$HOME/.claude" ] \
  && [ -z "$HERMES_API_KEY" ] && [ -z "$HERMES_BASE_URL" ] && [ -z "$OPENROUTER_API_KEY" ] && [ "$AI_PROVIDER" != "hermes" ]; then
  echo "WARNING: no AI set up for the chat. Set CLAUDE_CODE_OAUTH_TOKEN (Claude), or HERMES_API_KEY / HERMES_BASE_URL (Hermes, see README)."
fi
exec "$@"
