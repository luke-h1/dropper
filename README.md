# ipa-apk distributer

TestFlight not working? Need private distribution? Use this! Install links for internal iOS and Android builds. Upload an `.ipa` or `.apk`, open the link on your phone, tap install, voila!

Next.js on Cloudflare Workers. Builds are stored in R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luke-h1/ipa-apk-distributer)

## Setup

### Cloudflare + Terraform

`infra/` creates the R2 bucket, a scoped R2 key, the Worker, its domain and the API key.

1. Edit `infra/terraform.tfvars`.
2. Create a Cloudflare account token with Workers Scripts, Workers R2 Storage and Account API Tokens (edit), Account Settings (read), plus Workers Routes, DNS (edit) and Zone (read) on your zone.
3. Put `CLOUDFLARE_API_TOKEN`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the 1Password item `ci-cd/ipa-apk-distributer` or a secret provider of your choice, then:
   ```sh
   gh secret set OP_SERVICE_ACCOUNT
   gh variable set DEPLOY_ENABLED --body true
   ```
4. Push to `main`. Get the API key with:
   ```sh
   cd infra
   op run --env-file=op.env -- terraform init
   op run --env-file=op.env -- terraform output -raw api_key
   ```

### Anywhere else

Create a private bucket and a key that can read, write, delete and list it. Set the variables in `.env.example` (`openssl rand -hex 32` for the API key), then `bun run deploy`.

## Uploading

```sh
curl -fsSL https://dropper.example.com/dropper.mjs -o scripts/dropper.mjs
DROPPER_URL=https://dropper.example.com DROPPER_API_KEY=... \
  bun scripts/dropper.mjs upload build/app.ipa --profile preview --notes "Fix login crash"
```

This downloads the CLI. It reads the name, bundle id and version from the binary, records the git branch and commit, and prints a link and QR code. `dropper list` and `dropper delete <id>` also work.

## Installable builds

iOS only installs ad hoc, development or enterprise builds over the air. Android needs an APK, not an AAB. For EAS:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

Register test devices with `eas device:create`.

## Access

One `API_KEY` variable is responsible for protecting the endpoints. API calls should include it as `x-api-key`. In a browser, open any page with `?key=<API_KEY>`

## License

MIT
