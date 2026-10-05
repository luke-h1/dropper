resource "cloudflare_r2_bucket" "builds" {
  account_id = var.account_id
  name       = var.name
  location   = var.bucket_location
}

resource "cloudflare_r2_bucket_lifecycle" "builds" {
  count = var.retention_days > 0 ? 1 : 0

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.builds.name
  rules = [
    {
      id         = "expire-builds"
      enabled    = true
      conditions = { prefix = "builds/" }
      delete_objects_transition = {
        condition = { type = "Age", max_age = var.retention_days * 86400 }
      }
      abort_multipart_uploads_transition = {
        condition = { type = "Age", max_age = 86400 }
      }
    },
  ]
}

data "cloudflare_account_api_token_permission_groups_list" "all" {
  account_id = var.account_id
}

locals {
  r2_item_write = one([
    for group in data.cloudflare_account_api_token_permission_groups_list.all.result :
    group.id if group.name == "Workers R2 Storage Bucket Item Write"
  ])
}

resource "cloudflare_account_token" "r2" {
  account_id = var.account_id
  name       = "${var.name}-r2"
  policies = [
    {
      effect            = "allow"
      permission_groups = [{ id = local.r2_item_write }]
      resources = jsonencode({
        "com.cloudflare.edge.r2.bucket.${var.account_id}_default_${cloudflare_r2_bucket.builds.name}" = "*"
      })
    },
  ]
}

resource "random_password" "api_key" {
  length  = 48
  special = false
}

resource "cloudflare_worker" "site" {
  account_id    = var.account_id
  name          = var.name
  observability = { enabled = true }

  lifecycle {
    ignore_changes = [observability, subdomain, logpush, tags, tail_consumers]
  }
}

resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.account_id
  zone_name  = var.zone_name
  hostname   = var.hostname
  service    = cloudflare_worker.site.name
}
