# Secrets Folder

⚠️ **WARNING: This folder is for local secrets only!**

This folder is git-ignored and should contain:
- API keys
- Service account credentials
- SSL certificates
- Any other sensitive configuration files

## Files to place here:
- `firebase-service-account.json`
- `google-credentials.json`
- `ssl-certificate.pem`
- `private-key.key`

## Important Notes:
1. **Never commit secrets to git** - This folder is in `.gitignore`
2. **Share secrets securely** - Use password managers or encrypted channels
3. **Use environment variables** - Prefer `.env` for most secrets
4. **Rotate keys regularly** - Update credentials periodically

## For Team Members:
Contact the project admin to obtain the necessary secrets for local development.
