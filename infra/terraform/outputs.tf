output "api_url" {
  description = "Public HTTPS origin for NEXT_PUBLIC_PONYO_API_BASE_URL."
  value       = "https://${var.api_domain}"
}

output "load_balancer_dns_name" {
  value = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.id
}

output "media_cdn_url" {
  description = "HTTPS URL prefix for media object delivery."
  value       = "https://${aws_cloudfront_distribution.media.domain_name}"
}

output "media_cdn_host" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "orders_queue_url" {
  value = aws_sqs_queue.orders.url
}

output "aurora_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}
