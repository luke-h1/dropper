output "url" {
  value = "https://${var.hostname}"
}

output "access_password" {
  value     = var.password_protected ? random_password.access[0].result : null
  sensitive = true
}

output "upload_token" {
  value     = random_password.upload_token.result
  sensitive = true
}

# Everything the Worker needs, in the JSON shape `wrangler deploy --secrets-file` takes.
output "worker_secrets" {
  sensitive = true
  value = {
    S3_ENDPOINT          = "https://${var.account_id}.r2.cloudflarestorage.com"
    S3_REGION            = "auto"
    S3_BUCKET            = cloudflare_r2_bucket.builds.name
    S3_ACCESS_KEY_ID     = cloudflare_account_token.r2.id
    S3_SECRET_ACCESS_KEY = sha256(cloudflare_account_token.r2.value)
    UPLOAD_TOKEN         = random_password.upload_token.result
    SIGNING_SECRET       = random_password.signing_secret.result
    ACCESS_PASSWORD      = var.password_protected ? random_password.access[0].result : ""
  }
}
