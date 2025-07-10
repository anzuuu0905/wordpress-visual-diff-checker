# Cloud Scheduler for automated VRT checks
resource "google_cloud_scheduler_job" "vrt_daily_check" {
  name             = "vrt-daily-check"
  description      = "Daily WordPress VRT check at 3:00 AM JST"
  schedule         = "0 3 * * *"
  time_zone        = "Asia/Tokyo"
  region           = var.region
  
  http_target {
    uri         = "${var.cloud_run_url}/batch-check"
    http_method = "POST"
    
    body = base64encode(jsonencode({
      sites = "all"
      mode = "full"
      autoUpdate = false
      notifyOnSuccess = false
    }))
    
    headers = {
      "Content-Type" = "application/json"
    }
    
    oidc_token {
      service_account_email = var.service_account_email
    }
  }
  
  retry_config {
    retry_count = 3
    max_retry_duration = "600s"
    min_backoff_duration = "60s"
    max_backoff_duration = "300s"
  }
}

# Weekly comprehensive check with auto-update
resource "google_cloud_scheduler_job" "vrt_weekly_auto_update" {
  name             = "vrt-weekly-auto-update"
  description      = "Weekly WordPress auto-update and VRT check"
  schedule         = "0 2 * * 0"  # Every Sunday at 2:00 AM JST
  time_zone        = "Asia/Tokyo"
  region           = var.region
  
  http_target {
    uri         = "${var.cloud_run_url}/batch-check"
    http_method = "POST"
    
    body = base64encode(jsonencode({
      sites = "all"
      mode = "full"
      autoUpdate = true
      notifyOnSuccess = true
      rollbackOnCritical = true
    }))
    
    headers = {
      "Content-Type" = "application/json"
    }
    
    oidc_token {
      service_account_email = var.service_account_email
    }
  }
  
  retry_config {
    retry_count = 2
    max_retry_duration = "1200s"
    min_backoff_duration = "120s"
    max_backoff_duration = "600s"
  }
}

# Monthly comprehensive maintenance
resource "google_cloud_scheduler_job" "vrt_monthly_maintenance" {
  name             = "vrt-monthly-maintenance"
  description      = "Monthly maintenance: cleanup old data and optimize"
  schedule         = "0 1 1 * *"  # 1st day of month at 1:00 AM JST
  time_zone        = "Asia/Tokyo"
  region           = var.region
  
  http_target {
    uri         = "${var.cloud_run_url}/maintenance"
    http_method = "POST"
    
    body = base64encode(jsonencode({
      action = "full_cleanup"
      retentionDays = 90
      optimizeImages = true
      generateReport = true
    }))
    
    headers = {
      "Content-Type" = "application/json"
    }
    
    oidc_token {
      service_account_email = var.service_account_email
    }
  }
  
  retry_config {
    retry_count = 1
    max_retry_duration = "1800s"
  }
}

# IAM binding for Cloud Scheduler
resource "google_cloud_run_service_iam_member" "scheduler_invoker" {
  service  = var.cloud_run_service_name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_account_email}"
}

# Output scheduled job information
output "scheduled_jobs" {
  value = {
    daily_check = {
      name = google_cloud_scheduler_job.vrt_daily_check.name
      schedule = google_cloud_scheduler_job.vrt_daily_check.schedule
      time_zone = google_cloud_scheduler_job.vrt_daily_check.time_zone
    }
    weekly_auto_update = {
      name = google_cloud_scheduler_job.vrt_weekly_auto_update.name
      schedule = google_cloud_scheduler_job.vrt_weekly_auto_update.schedule
      time_zone = google_cloud_scheduler_job.vrt_weekly_auto_update.time_zone
    }
    monthly_maintenance = {
      name = google_cloud_scheduler_job.vrt_monthly_maintenance.name
      schedule = google_cloud_scheduler_job.vrt_monthly_maintenance.schedule
      time_zone = google_cloud_scheduler_job.vrt_monthly_maintenance.time_zone
    }
  }
}