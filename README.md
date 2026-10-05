# Dropper

Self-hosted install links for internal iOS and Android builds. Upload an `.ipa` or `.apk` from `eas build --local` (or anywhere else), open the link on your phone and tap Install.

- Next.js app, deploys to **Cloudflare Workers** (default) or **Vercel**
- Builds live in any S3-compatible bucket (Cloudflare R2, AWS S3, MinIO...)
- iOS installs over the air via `itms-services`, Android downloads the APK directly
- Zero-dependency CLI that reads the app name, bundle id and version straight from the binary
- Optional password on the site, uploads are authenticated with a token

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luke-h1/ipa-apk-distributer)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/luke-h1/ipa-apk-distributer&env=S3_ENDPOINT,S3_REGION,S3_BUCKET,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,UPLOAD_TOKEN,SIGNING_SECRET,ACCESS_PASSWORD)

## How it works

```
dropper upload app.ipa ──POST /api/uploads──▶ site ──▶ presigned PUT URL
                       ──PUT file────────────────────▶ bucket
                       ──POST /api/uploads/:id/complete──▶ site writes meta.json
phone ──/b/:id──▶ site ──itms-services / download──▶ short-lived presigned GET ──▶ bucket
```

Files go straight from your machine to the bucket, so Worker/Vercel request size limits don't apply. There's no database, each build is `builds/<id>/` in the bucket with the binary and a `meta.json`.

## Setup

Click **Use this template** on GitHub (or fork it), then pick one of the options below.

### Cloudflare with Terraform (recommended)

[`infra/`](infra) creates everything: the R2 bucket (with a lifecycle rule that deletes builds after 90 days), an R2 access key scoped to that bucket, the Worker, its custom domain, and the upload token, signing secret and site password. GitHub Actions applies it and deploys the Worker on every push to `main`, and posts a plan on PRs.

1. Edit [`infra/terraform.tfvars`](infra/terraform.tfvars) (account, hostname, zone) and [`infra/backend.hcl`](infra/backend.hcl) (an S3 bucket for Terraform state). Other knobs are in [`infra/variables.tf`](infra/variables.tf).
2. Create a Cloudflare **account** API token with:
   - Account: *Workers Scripts: Edit*, *Workers R2 Storage: Edit*, *Account API Tokens: Edit*, *Account Settings: Read*
   - Zone (your zone): *Workers Routes: Edit*, *DNS: Edit*, *Zone: Read*
3. Add repo secrets `CLOUDFLARE_API_TOKEN`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (for the state bucket), and set the repo variable `DEPLOY_ENABLED` to `true`:
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set AWS_ACCESS_KEY_ID
   gh secret set AWS_SECRET_ACCESS_KEY
   gh variable set DEPLOY_ENABLED --body true
   ```
4. Push to `main` (or run the *Deploy* workflow). Then grab your credentials:
   ```sh
   cd infra
   terraform init -backend-config=backend.hcl
   terraform output -raw upload_token     # DROPPER_TOKEN for the CLI
   terraform output -raw access_password  # to sign in to the site
   ```

To run it locally instead: `terraform -chdir=infra apply`, then `terraform -chdir=infra output -json worker_secrets > .secrets.json && bunx opennextjs-cloudflare build && bunx opennextjs-cloudflare deploy --secrets-file .secrets.json && rm .secrets.json`.

### Cloudflare by hand, or AWS S3

1. Create a bucket and an access key.
   - **R2:** create a bucket, then *R2 → Manage API tokens → Create API token* with *Object Read & Write* scoped to that bucket. The endpoint is `https://<account-id>.r2.cloudflarestorage.com` and the region is `auto`.
   - **AWS S3:** create a bucket and an IAM user with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` and `s3:ListBucket` on it. The endpoint is `https://s3.<region>.amazonaws.com`.
   - The bucket stays private, no public access or CORS needed.
2. Generate an upload token and signing secret with `openssl rand -hex 32`.
3. Set the variables from [`.env.example`](.env.example) and deploy:
   ```sh
   bun install
   for name in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY UPLOAD_TOKEN SIGNING_SECRET ACCESS_PASSWORD; do
     bunx wrangler secret put $name
   done
   bun run deploy
   ```
   Add your domain to `routes` in [`wrangler.jsonc`](wrangler.jsonc).

### Vercel

Import the repo and add the variables from `.env.example`. Nothing else to configure.

## Uploading builds

The CLI is a single file with no dependencies. Your deployed site serves it at `/dropper.mjs`, so in your app repo:

```sh
curl -fsSL https://dropper.example.com/dropper.mjs -o scripts/dropper.mjs
```

and set `DROPPER_URL` and `DROPPER_TOKEN` (bun picks them up from `.env.local` automatically):

```sh
eas build --local --profile preview --platform ios --output build/app.ipa
bun scripts/dropper.mjs upload build/app.ipa --profile preview --notes "Fixes the login crash"
```

It prints the build link and a QR code. The current git branch and commit are recorded automatically.

```
dropper upload <file.ipa|file.apk> [--profile] [--channel] [--notes] [--name] [--no-git] [--no-qr]
dropper list
dropper delete <id>
```

## Making builds installable

**iOS** only installs over the air if the IPA is signed for ad hoc, development or enterprise distribution. App Store/TestFlight builds won't install, and Dropper shows a warning for them. With EAS, use a profile with `"distribution": "internal"` and register test devices with `eas device:create`:

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

**Android** needs an `.apk`, not an `.aab`, hence `"buildType": "apk"`.

## Housekeeping

Delete a build with `dropper delete <id>`. The Terraform setup expires builds after `retention_days` (90 by default). Otherwise add a lifecycle rule on the `builds/` prefix to your bucket (R2: *Settings → Object lifecycle rules*).

## Development

```sh
bun install
cp .env.example .env.local   # fill in, or run the fake S3 below
bun test/fake-s3.ts          # in-memory S3 on :9000, bucket "dropper"
bun dev
```

```sh
bun run lint && bun run format:check && bun run ts:check && bun test
bun run build:cli            # rebuild public/dropper.mjs after changing cli/
bun run preview              # run the Worker build locally (reads .dev.vars)
```

## Security

- Uploads, listing and deletes need `Authorization: Bearer $UPLOAD_TOKEN`.
- With `ACCESS_PASSWORD` set, pages and downloads need a signed cookie. Without it, anyone with the URL can install builds.
- iOS's installer can't send cookies, so the install manifest uses an HMAC-signed link valid for an hour. File URLs are presigned and expire after 5 to 60 minutes.

## License

MIT
