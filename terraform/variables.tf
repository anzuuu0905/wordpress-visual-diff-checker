# Terraform variables for WordPress VRT automation

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "service_account_email" {
  description = "Service account email for Cloud Run and Scheduler"
  type        = string
}

variable "cloud_run_url" {
  description = "Cloud Run service URL"
  type        = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "vrt-runner"
}

variable "drive_root_folder_id" {
  description = "Google Drive root folder ID for storing screenshots"
  type        = string
}

variable "sheets_id" {
  description = "Google Sheets ID for VRT reports"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "discord_webhook_url" {
  description = "Discord webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "notification_email" {
  description = "Email address for critical alerts"
  type        = string
  default     = ""
}

variable "auto_update_enabled" {
  description = "Enable automatic WordPress updates"
  type        = bool
  default     = false
}

variable "rollback_enabled" {
  description = "Enable automatic rollback on critical failures"
  type        = bool
  default     = false
}

variable "diff_threshold" {
  description = "Diff percentage threshold for NG status"
  type        = number
  default     = 2.0
}

variable "critical_threshold" {
  description = "Critical diff percentage threshold for auto-rollback"
  type        = number
  default     = 10.0
}

variable "retention_days" {
  description = "Number of days to retain screenshots and reports"
  type        = number
  default     = 90
}

variable "max_concurrent_sites" {
  description = "Maximum number of sites to process concurrently"
  type        = number
  default     = 5
}

variable "screenshot_timeout" {
  description = "Screenshot timeout in seconds"
  type        = number
  default     = 60
}

variable "crawl_max_urls" {
  description = "Maximum number of URLs to crawl per site"
  type        = number
  default     = 300
}

variable "crawl_max_depth" {
  description = "Maximum crawl depth"
  type        = number
  default     = 3
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "enable_monitoring" {
  description = "Enable monitoring and alerting"
  type        = bool
  default     = true
}

variable "log_level" {
  description = "Log level (debug, info, warn, error)"
  type        = string
  default     = "info"
}