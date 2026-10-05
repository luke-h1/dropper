# Dropper

Install links for internal iOS and Android builds. Upload an `.ipa` or `.apk`, open the link on your phone, tap Install.

Next.js on Cloudflare Workers or Vercel. Builds are stored in R2 or any S3-compatible bucket.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luke-h1/ipa-apk-distributer)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/luke-h1/ipa-apk-distributer&env=S3_ENDPOINT,S3_REGION,S3_BUCKET,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,API_KEY)

## Setup

### Cloudflare + Terraform

`infra/` creates the R2 bucket, a scoped R2 key, the Worker, its domain and the API key. CI plans on PRs and applies + deploys on `main`.

1. Edit `infra/terraform.tfvars` and `infra/backend.hcl`.
2. Create a Cloudflare account token with Workers Scripts, Workers R2 Storage and Account API Tokens (edit), Account Settings (read), plus Workers Routes, DNS (edit) and Zone (read) on your zone.
3. Put `CLOUDFLARE_API_TOKEN`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the 1Password item `ci-cd/ipa-apk-distributer`, then:
   ```sh
   gh secret set OP_SERVICE_ACCOUNT
   gh variable set DEPLOY_ENABLED --body true
   ```
4. Push to `main`. Get the API key with:
   ```sh
   cd infra
   op run --env-file=op.env -- terraform init -backend-config=backend.hcl
   op run --env-file=op.env -- terraform output -raw api_key
   ```

### Anywhere else

Create a private bucket and a key that can read, write, delete and list it. Set the variables in `.env.example` (`openssl rand -hex 32` for the API key), then `bun run deploy` for Workers or import the repo on Vercel.

## Uploading

```sh
curl -fsSL https://dropper.example.com/dropper.mjs -o scripts/dropper.mjs
DROPPER_URL=https://dropper.example.com DROPPER_API_KEY=... \
  bun scripts/dropper.mjs upload build/app.ipa --profile preview --notes "Fix login crash"
```

The CLI reads the name, bundle id and version from the binary, records the git branch and commit, and prints a link and QR code. `dropper list` and `dropper delete <id>` also work.

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

## Development

```sh
bun install
bun test/fake-s3.ts   # in-memory S3 on :9000
bun dev
bun run lint && bun run ts:check && bun test
bun run build:cli     # after changing cli/
```

## Access

One `API_KEY` protects everything. API calls send it as `x-api-key`. In a browser, open any page with `?key=<API_KEY>` once and it's swapped for a cookie. The QR codes include it, so treat them like the key itself: anyone holding it can upload and delete builds too.

## License

MIT
