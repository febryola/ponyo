# AWS foundation (Tokyo)

This Terraform stack is a deployable infrastructure baseline for the FastAPI container, configured for `ap-northeast-1`. It creates a VPC with public/private subnets, one NAT gateway, an HTTPS ALB, ECS/Fargate API service, Aurora PostgreSQL Serverless v2, encrypted Multi-AZ ElastiCache Redis, a private versioned media bucket behind CloudFront OAC, ECR, CloudWatch logs, SQS with DLQ, EventBridge bus, and least-purpose task IAM policies.

## Important before using Terraform

- **Do not run `terraform apply` until the AWS account, budget, domain, and deployment are reviewed.** This stack creates billable resources (Aurora, Redis, NAT, ALB, ECS, and storage). It has not been applied.
- Bootstrap an encrypted, versioned S3 Terraform state bucket and DynamoDB lock table separately; configure the remote backend before initializing. Restrict state access: state contains the generated Redis auth secret and database resource metadata.
- Validate that the selected AZ names exist in your AWS account and that subnet CIDRs do not overlap an existing network.
- Create/validate an ACM certificate in Tokyo for `api_domain`. If Route 53 is not used, point the API DNS record at the ALB DNS name manually.
- Bootstrap the ECR repository first with a targeted Terraform apply, build/push the backend image to that repository, then set `container_image` to the pushed immutable image URI and run a full plan/apply. Do not start the ECS service with a placeholder image.
- Create Secrets Manager entries for JWT, Stripe test credentials, and Stripe webhook secret. Keep live Stripe keys out of a production plan until the test integration is signed off.
- Supply a random 32–128 character alphanumeric Redis auth token. Use a protected `*.tfvars` file ignored by Git or a secure CI secret input; never paste credentials into chat or commit them.
- The DB resource uses its managed Secrets Manager password. The API receives the password separately and builds a TLS connection URL at runtime.
- Build and scan the backend image, push an immutable image to ECR, then pass that exact image URI as `container_image`. The local editor scanner currently reports upstream Python Alpine base-image advisories; review a fresh image scan and update the base before production deployment.

## Frontend cookies and CORS

The confirmed storefront domain is `byponyo.com`; use `api.byponyo.com` for the backend. Set `frontend_origin` to `https://byponyo.com` and `cookie_domain` to `.byponyo.com`. Cross-site browser cookie policies can block auth if the storefront remains on a different-site Vercel hostname. Set the Next.js `NEXT_PUBLIC_PONYO_API_BASE_URL` to the Terraform `api_url` output after DNS and TLS are live.

## What still needs implementation before real commerce

The API transactionally publishes SQS events through an outbox, but an idempotent SQS consumer, EventBridge publisher/subscriptions, fulfillment/supplier adapters, email/SES integration, S3 upload/signing routes, WAF rules, alarms/budgets, and production runbooks must still be implemented and verified. The development seed inventory is not supplier-approved. Do not accept real orders until catalog, shipping rates, payment/webhook behavior, email, refunds, privacy retention, alerting, and restore drills are validated in a non-production environment.
