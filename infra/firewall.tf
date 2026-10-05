data "cloudflare_zone" "site" {
  count = var.apply_firewall ? 1 : 0

  filter = { name = var.zone_name }
}

resource "cloudflare_ruleset" "firewall" {
  count = var.apply_firewall ? 1 : 0

  zone_id = data.cloudflare_zone.site[0].zone_id
  name    = "${var.name} firewall"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [
    {
      action      = "block"
      description = "Block methods the app does not use"
      expression  = "(http.host eq \"${var.hostname}\" and not http.request.method in {\"GET\" \"HEAD\" \"POST\" \"DELETE\"})"
      enabled     = true
    },
    {
      action      = "block"
      description = "Block keyless API calls, except the key login and signed iOS manifests"
      expression  = "(http.host eq \"${var.hostname}\" and starts_with(http.request.uri.path, \"/api/\") and http.request.uri.path ne \"/api/session\" and not http.request.uri.path wildcard r\"/api/builds/*/manifest/*\" and not any(http.request.headers.names[*] eq \"x-api-key\") and not http.cookie contains \"ipa_apk_distributor_session=\")"
      enabled     = true
    },
  ]
}
