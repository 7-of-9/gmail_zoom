#!/usr/bin/env bash
# Deploy the sync function to Azure (resource group "panezoom", app "panezoom-sync").
# Needs: az login. Creates nothing; see README "Sync server" for the one-time setup.
set -euo pipefail
cd "$(dirname "$0")"
zip="$(mktemp -d)/sync.zip"
zip -qr "$zip" host.json zoom
az functionapp deployment source config-zip -g "${RG:-panezoom}" -n "${APP:-panezoom-sync}" --src "$zip" -o none
echo "deployed: https://${APP:-panezoom-sync}.azurewebsites.net/api/v1/zoom/{acct}"
