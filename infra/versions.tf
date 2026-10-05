terraform {
  required_version = ">= 1.12"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket       = "cloudflare-zone-config-terraform-state"
    region       = "eu-west-2"
    key          = "ipa-apk-distributer/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "cloudflare" {}
