#!/usr/bin/env bash
# Copies the local .env (gitignored) into AWS SSM Parameter Store under /habitatfire/.
# Keys, passwords and the MongoDB URI are stored as SecureString. Values are never printed.
# Usage (from the repo root): bash deploy/push-secrets.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1
REGION="${AWS_REGION_DEPLOY:-us-east-1}"
ENV_FILE="${1:-.env}"
[ -f "$ENV_FILE" ] || { echo "Arquivo $ENV_FILE não encontrado"; exit 1; }
while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue ;; esac
  [ -n "$value" ] || continue
  type=String
  case "$key" in *KEY*|*PASSWORD*|MONGODB_URI) type=SecureString ;; esac
  aws ssm put-parameter --region "$REGION" --name "/habitatfire/$key" --type "$type" \
    --value "$value" --overwrite --query Version --output text >/dev/null
  echo "ok  /habitatfire/$key ($type)"
done < "$ENV_FILE"
