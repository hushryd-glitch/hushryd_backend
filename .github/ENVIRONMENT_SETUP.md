# GitHub Environment Setup Guide

This document explains how to configure GitHub environments for the HushRyd CI/CD pipeline, including manual approval gates for production deployments.

## Environments Overview

The pipeline uses three environments:
- **development** - Auto-deploys on merge to `develop` branch
- **staging** - Auto-deploys on merge to `staging` branch  
- **production** - Requires manual approval before deployment on merge to `main` branch

## Setting Up Manual Approval for Production

### Step 1: Navigate to Environment Settings

1. Go to your GitHub repository
2. Click **Settings** > **Environments**
3. Click on **production** (or create it if it doesn't exist)

### Step 2: Configure Required Reviewers

1. Check **Required reviewers**
2. Add team members or teams who can approve production deployments
3. Recommended: Add at least 2 reviewers for production
4. Click **Save protection rules**

### Step 3: Configure Additional Protection Rules (Recommended)

#### Wait Timer
- Set a wait timer (e.g., 5 minutes) to allow time for review before deployment starts

#### Deployment Branches
- Restrict deployments to only the `main` branch:
  - Select **Selected branches**
  - Add pattern: `main`

### Step 4: Configure Environment Secrets

Add the following secrets to the **production** environment:

| Secret Name | Description |
|-------------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key for production |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key for production |
| `AWS_REGION` | AWS region (e.g., `ap-south-1`) |
| `AWS_ACCOUNT_ID` | AWS account ID |
| `SLACK_WEBHOOK_URL` | Slack webhook for deployment notifications |

## How Manual Approval Works

1. When code is merged to `main`, the production deployment job is triggered
2. GitHub pauses the workflow and sends notifications to required reviewers
3. Reviewers can view the pending deployment in the **Actions** tab
4. A reviewer must click **Review deployments** and approve
5. Once approved, the blue-green deployment proceeds

## Blue-Green Deployment Process

The production deployment uses AWS CodeDeploy for blue-green deployments:

1. **Build Phase**: Docker image is built and pushed to ECR
2. **Migration Phase**: Database migrations run against production
3. **Register Task**: New ECS task definition is registered
4. **Blue-Green Deploy**: CodeDeploy creates deployment with traffic shifting
5. **Health Check**: Validates the new deployment is healthy
6. **Rollback**: Automatic rollback if health checks fail

### Traffic Shifting Strategy

The deployment uses `CodeDeployDefault.ECSLinear10PercentEvery1Minutes`:
- Shifts 10% of traffic every minute
- Full deployment completes in ~10 minutes
- Allows monitoring for issues during gradual rollout

## Rollback Procedures

### Automatic Rollback
- Triggered when health checks fail
- CodeDeploy automatically reverts to the blue (original) environment
- Previous task definition is restored

### Manual Rollback
To manually rollback:

```bash
# Via AWS CLI
aws ecs update-service \
  --cluster hushryd-production \
  --service hushryd-backend-production \
  --task-definition <previous-task-definition-arn> \
  --force-new-deployment

# Via CodeDeploy
aws deploy stop-deployment \
  --deployment-id <deployment-id> \
  --auto-rollback-enabled
```

## Monitoring Deployments

### GitHub Actions
- View deployment status in the **Actions** tab
- Check deployment logs for detailed information

### AWS Console
- **ECS Console**: View service status and task health
- **CodeDeploy Console**: Monitor blue-green deployment progress
- **CloudWatch**: View application logs and metrics

## Troubleshooting

### Deployment Stuck Waiting for Approval
- Check that required reviewers have been notified
- Verify the reviewer has access to the repository
- Check GitHub notification settings

### Health Check Failures
- Review CloudWatch logs for application errors
- Check ECS task status in AWS Console
- Verify security groups allow health check traffic

### Rollback Issues
- Ensure previous task definition exists
- Check IAM permissions for ECS and CodeDeploy
- Review CodeDeploy deployment history
