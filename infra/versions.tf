terraform {
  required_version = ">= 1.10"

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

  # Partial config, pass the rest with -backend-config. See README.
  backend "s3" {
    key          = "ipa-apk-distributer/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "cloudflare" {}
