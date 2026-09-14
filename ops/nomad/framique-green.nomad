# ==============================================================================
# Framique — Green Candidate/Standby Production Job Specification (HashiCorp Nomad)
#
# Topology:
#  - Driver: Docker
#  - Slot: GREEN (Port 3000 mapped to dynamic/service port)
#  - Healthchecks: Liveness & Readiness on /api/healthz
#  - Dynamic Canary Routing & Promotion
# ==============================================================================

variable "datacenter" {
  type        = string
  default     = "dc1"
  description = "Nomad datacenter target"
}

variable "image" {
  type        = string
  default     = "framique:green"
  description = "Docker image tag for Green candidate workload"
}

variable "git_sha" {
  type        = string
  default     = "unknown"
  description = "Git commit SHA deployed in this release candidate"
}

variable "node_count" {
  type        = number
  default     = 2
  description = "Number of instances running the Green candidate service"
}

variable "cpu" {
  type        = number
  default     = 2000
  description = "CPU allocation in MHz"
}

variable "memory" {
  type        = number
  default     = 2048
  description = "Memory allocation in MB"
}

variable "redis_url" {
  type        = string
  default     = "redis://redis.service.consul:6379"
  description = "Redis URL for session cache and canary metrics"
}

variable "supabase_url" {
  type        = string
  default     = "https://db.framique.internal"
  description = "Supabase API endpoint"
}

variable "supabase_anon_key" {
  type        = string
  default     = ""
  description = "Supabase Anon Key"
}

variable "supabase_service_role_key" {
  type        = string
  default     = ""
  description = "Supabase Service Role Key"
}

variable "metrics_token" {
  type        = string
  default     = ""
  description = "Bearer token for Prometheus /api/public/metrics scraping"
}

job "framique-green" {
  datacenters = [var.datacenter]
  type        = "service"
  priority    = 80

  update {
    max_parallel     = 1
    min_healthy_time = "30s"
    healthy_deadline = "3m"
    progress_deadline = "5m"
    auto_revert      = true
    auto_promote     = false
    canary           = 0
  }

  group "web" {
    count = var.node_count

    network {
      mode = "bridge"
      port "http" {
        to = 3000
      }
    }

    service {
      name = "framique-green"
      port = "http"
      tags = [
        "slot=green",
        "env=production",
        "canary=candidate",
        "sha=${var.git_sha}",
        "traefik.enable=true",
        "traefik.http.routers.framique-green.rule=PathPrefix(`/`)"
      ]

      check {
        name     = "framique-green-liveness"
        type     = "http"
        path     = "/api/healthz?type=liveness"
        interval = "10s"
        timeout  = "3s"

        check_restart {
          limit           = 3
          grace           = "30s"
          ignore_warnings = false
        }
      }

      check {
        name     = "framique-green-readiness"
        type     = "http"
        path     = "/api/healthz?type=readiness"
        interval = "10s"
        timeout  = "3s"
      }
    }

    restart {
      attempts = 3
      interval = "2m"
      delay    = "15s"
      mode     = "fail"
    }

    task "app" {
      driver = "docker"

      config {
        image = var.image
        ports = ["http"]
        logging {
          type = "journald"
          config {
            tag = "framique-green"
          }
        }
      }

      env {
        NODE_ENV                  = "production"
        PORT                      = "3000"
        HOST                      = "0.0.0.0"
        CLUSTER_SLOT              = "green"
        GIT_SHA                   = var.git_sha
        REDIS_URL                 = var.redis_url
        SUPABASE_URL              = var.supabase_url
        SUPABASE_ANON_KEY         = var.supabase_anon_key
        SUPABASE_SERVICE_ROLE_KEY = var.supabase_service_role_key
        METRICS_TOKEN             = var.metrics_token
      }

      resources {
        cpu    = var.cpu
        memory = var.memory
      }
    }
  }
}
