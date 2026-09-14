# ==============================================================================
# Framique — OpenResty Edge Router & Ingress Gateway (HashiCorp Nomad)
#
# Topology:
#  - Driver: Docker (openresty/openresty:1.25.3.1-alpine)
#  - Ports: 80 (HTTP) and 443 (HTTPS)
#  - Service Discovery: Consul-Template dynamic upstream generation
#  - TLS: Automatic Let's Encrypt certificates via lua-resty-acme
#  - Dynamic Routing: Canary traffic splitting (Blue/Green) & Tenant Cohorts
# ==============================================================================

variable "datacenter" {
  type        = string
  default     = "dc1"
  description = "Nomad datacenter target"
}

variable "image" {
  type        = string
  default     = "openresty/openresty:1.25.3.1-alpine"
  description = "Docker image tag for OpenResty edge router"
}

variable "edge_count" {
  type        = number
  default     = 2
  description = "Number of ingress router instances"
}

variable "acme_email" {
  type        = string
  default     = "ops@framique.com"
  description = "ACME Let's Encrypt registration email"
}

variable "domain_edge_token" {
  type        = string
  default     = ""
  description = "Authentication token for domain verification callbacks"
}

variable "redis_url" {
  type        = string
  default     = "redis://redis.service.consul:6379"
  description = "Redis endpoint for real-time canary and cohort weights"
}

job "openresty-edge" {
  datacenters = [var.datacenter]
  type        = "system" # Runs on every dedicated edge/gateway host
  priority    = 90

  update {
    max_parallel     = 1
    min_healthy_time = "15s"
    healthy_deadline = "2m"
    progress_deadline = "4m"
    auto_revert      = true
  }

  group "router" {
    network {
      mode = "bridge"
      port "http" {
        static = 80
        to     = 80
      }
      port "https" {
        static = 443
        to     = 443
      }
      port "status" {
        to = 8080
      }
    }

    service {
      name = "openresty-edge"
      port = "http"
      tags = ["ingress", "edge-router", "http"]

      check {
        name     = "edge-health-http"
        type     = "http"
        path     = "/healthz"
        interval = "5s"
        timeout  = "2s"

        check_restart {
          limit           = 3
          grace           = "15s"
          ignore_warnings = false
        }
      }
    }

    restart {
      attempts = 5
      interval = "2m"
      delay    = "10s"
      mode     = "delay"
    }

    task "openresty" {
      driver = "docker"

      config {
        image = var.image
        ports = ["http", "https", "status"]
        volumes = [
          "local/upstream.conf:/etc/nginx/conf.d/upstream.conf:ro",
          "local/canary-weights.conf:/etc/nginx/conf.d/canary-weights.conf:ro"
        ]
        logging {
          type = "journald"
          config {
            tag = "openresty-edge"
          }
        }
      }

      # Dynamically synthesize upstream targets from Consul service catalog
      template {
        data = <<EOF
upstream framique_blue {
  {{ range service "framique-blue" }}
  server {{ .Address }}:{{ .Port }} max_fails=3 fail_timeout=10s;
  {{ else }}
  server 127.0.0.1:3001 backup;
  {{ end }}
  keepalive 32;
}

upstream framique_green {
  {{ range service "framique-green" }}
  server {{ .Address }}:{{ .Port }} max_fails=3 fail_timeout=10s;
  {{ else }}
  server 127.0.0.1:3002 backup;
  {{ end }}
  keepalive 32;
}
EOF
        destination   = "local/upstream.conf"
        change_mode   = "signal"
        change_signal = "SIGHUP"
      }

      # Dynamically load canary routing split
      template {
        data = <<EOF
# Canary traffic splitting configuration
# Auto-rendered by Nomad & Consul Template
split_clients "${remote_addr}${http_user_agent}" $canary_slot {
  0%     green;
  *      blue;
}
EOF
        destination   = "local/canary-weights.conf"
        change_mode   = "signal"
        change_signal = "SIGHUP"
      }

      env {
        ACME_ACCOUNT_EMAIL = var.acme_email
        ACME_STAGING       = "false"
        DOMAIN_EDGE_TOKEN  = var.domain_edge_token
        REDIS_URL          = var.redis_url
      }

      resources {
        cpu    = 1000
        memory = 1024
      }
    }
  }
}
