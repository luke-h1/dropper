variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "hostname" {
  description = "Where the site is served, e.g. dropper.example.com"
  type        = string
}

variable "zone_name" {
  description = "Cloudflare zone the hostname belongs to, e.g. example.com"
  type        = string
}

variable "name" {
  description = "Worker and bucket name. Must match `name` in wrangler.jsonc"
  type        = string
  default     = "dropper"
}

variable "bucket_location" {
  description = "R2 location hint: wnam, enam, weur, eeur, apac or oc"
  type        = string
  default     = "weur"
}

variable "retention_days" {
  description = "Delete builds older than this many days. 0 keeps them forever"
  type        = number
  default     = 90
}

variable "password_protected" {
  description = "Ask for a generated password before showing builds"
  type        = bool
  default     = true
}
