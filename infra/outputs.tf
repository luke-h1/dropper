output "account_id" {
  value = var.account_id
}

output "url" {
  value = "https://${var.hostname}"
}

output "api_key" {
  value     = random_password.api_key.result
  sensitive = true
}

output "worker_secrets" {
  sensitive = true
  value = {
    S3_ENDPOINT          = "https://${var.account_id}.r2.cloudflarestorage.com"
    S3_BUCKET            = cloudflare_r2_bucket.builds.name
    S3_ACCESS_KEY_ID     = cloudflare_account_token.r2.id
    S3_SECRET_ACCESS_KEY = sha256(cloudflare_account_token.r2.value)
    API_KEY              = random_password.api_key.result
  }
}
