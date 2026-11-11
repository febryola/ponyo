variable "aws_region" {
  description = "AWS region for the Ponyo production stack."
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  type    = string
  default = "ponyo"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["ap-northeast-1a", "ap-northeast-1c"]
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "Use at least two availability zones for production."
  }
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.0.0/24", "10.40.1.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.10.0/24", "10.40.11.0/24"]
}

variable "certificate_arn" {
  description = "Prevalidated ACM certificate ARN in ap-northeast-1 for the API hostname."
  type        = string
}

variable "api_domain" {
  description = "HTTPS hostname covered by the ACM certificate, e.g. api.ponyo.example."
  type        = string
}

variable "route53_zone_id" {
  description = "Optional hosted zone ID. If empty, create the API DNS record manually."
  type        = string
  default     = ""
}

variable "container_image" {
  description = "Immutable ECR image URI including a release tag or digest."
  type        = string
}

variable "frontend_origin" {
  description = "Exact HTTPS storefront origin. Prefer a custom domain on the same registrable domain as the API for cookie compatibility."
  type        = string
}

variable "cookie_domain" {
  description = "Shared parent domain for the storefront and API cookies, e.g. .ponyo.example."
  type        = string
  validation {
    condition     = startswith(var.cookie_domain, ".")
    error_message = "Set a shared cookie parent domain beginning with a dot, such as .ponyo.example."
  }
}

variable "stripe_secret_key_arn" {
  description = "Secrets Manager ARN containing the Stripe secret key as SecretString."
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret_arn" {
  description = "Secrets Manager ARN containing the Stripe webhook signing secret as SecretString."
  type        = string
  sensitive   = true
}

variable "jwt_secret_arn" {
  description = "Secrets Manager ARN containing a random JWT signing secret as SecretString."
  type        = string
  sensitive   = true
}

variable "smtp_host" {
  description = "SMTP provider hostname for production email delivery."
  type        = string
  validation {
    condition     = length(trimspace(var.smtp_host)) > 0
    error_message = "Supply a non-empty SMTP hostname."
  }
}

variable "smtp_from_email" {
  description = "Sender email address verified with the SMTP provider."
  type        = string
  validation {
    condition     = length(trimspace(var.smtp_from_email)) > 0
    error_message = "Supply a non-empty verified sender email address."
  }
}

variable "smtp_username" {
  description = "SMTP authentication username (not necessarily an email address)."
  type        = string
  validation {
    condition     = length(trimspace(var.smtp_username)) > 0
    error_message = "Supply a non-empty SMTP authentication username."
  }
}

variable "smtp_password_secret_arn" {
  description = "Secrets Manager ARN containing only the SMTP password as a plain SecretString, not JSON."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$", var.smtp_password_secret_arn))
    error_message = "Supply the full Secrets Manager secret ARN for the SMTP password."
  }
}

variable "smtp_port" {
  description = "SMTP submission port; defaults to STARTTLS on port 587."
  type        = number
  default     = 587
  validation {
    condition     = var.smtp_port >= 1 && var.smtp_port <= 65535 && floor(var.smtp_port) == var.smtp_port
    error_message = "Use an integer SMTP port between 1 and 65535."
  }
}

variable "smtp_starttls" {
  description = "Upgrade SMTP connections with STARTTLS; keep enabled for production."
  type        = bool
  default     = true
}

variable "redis_auth_token" {
  description = "Strong ElastiCache auth token. Terraform state must use an encrypted remote backend with restricted access."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.redis_auth_token) >= 32 && length(var.redis_auth_token) <= 128 && can(regex("^[A-Za-z0-9]+$", var.redis_auth_token))
    error_message = "Use a 32–128 character alphanumeric Redis auth token."
  }
}

variable "database_name" {
  type    = string
  default = "ponyo"
}

variable "database_user" {
  type    = string
  default = "ponyo_app"
}

variable "desired_api_count" {
  type    = number
  default = 2
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "enable_deletion_protection" {
  type    = bool
  default = true
}
