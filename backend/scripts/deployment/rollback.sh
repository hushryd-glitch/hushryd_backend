#!/bin/bash
# HushRyd Backend Deployment Rollback Script
# This script handles automatic and manual rollback of ECS deployments
# Requirements: 2.4, 12.1 - Auto-rollback on failure within 60 seconds

set -e

# Configuration
CLUSTER_NAME="${CLUSTER_NAME:-hushryd-production}"
SERVICE_NAME="${SERVICE_NAME:-hushryd-backend-production}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-https://api.hushryd.com/health}"
ROLLBACK_TIMEOUT=60  # seconds - per requirement 2.4
MAX_HEALTH_RETRIES=5
HEALTH_CHECK_INTERVAL=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Get current task definition
get_current_task_definition() {
    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --query 'services[0].taskDefinition' \
        --output text
}

# Get previous task definition (one revision back)
get_previous_task_definition() {
    local current_task="$1"
    local family=$(echo "$current_task" | sed 's/:.*$//' | sed 's/.*\///')
    local current_revision=$(echo "$current_task" | sed 's/.*://')
    local previous_revision=$((current_revision - 1))
    
    if [ "$previous_revision" -lt 1 ]; then
        log_error "No previous revision available for rollback"
        return 1
    fi
    
    echo "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:task-definition/${family}:${previous_revision}"
}

# Perform health check
health_check() {
    local url="$1"
    local response
    
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Wait for service stability
wait_for_stability() {
    local timeout="$1"
    local start_time=$(date +%s)
    
    log_info "Waiting for service stability (timeout: ${timeout}s)..."
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ "$elapsed" -ge "$timeout" ]; then
            log_error "Timeout waiting for service stability"
            return 1
        fi
        
        local status=$(aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --query 'services[0].deployments[?status==`PRIMARY`].runningCount' \
            --output text)
        
        local desired=$(aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --query 'services[0].desiredCount' \
            --output text)
        
        if [ "$status" = "$desired" ] && [ "$status" != "0" ]; then
            log_info "Service is stable (running: $status, desired: $desired)"
            return 0
        fi
        
        log_info "Waiting... (running: $status, desired: $desired, elapsed: ${elapsed}s)"
        sleep 5
    done
}

# Perform rollback
perform_rollback() {
    local target_task="$1"
    local start_time=$(date +%s)
    
    log_info "Initiating rollback to: $target_task"
    
    # Update service with previous task definition
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$SERVICE_NAME" \
        --task-definition "$target_task" \
        --force-new-deployment \
        --output text > /dev/null
    
    log_info "Rollback deployment initiated"
    
    # Wait for rollback to complete
    if wait_for_stability "$ROLLBACK_TIMEOUT"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_info "Rollback completed successfully in ${duration}s"
        
        # Verify health after rollback
        local retry=0
        while [ "$retry" -lt "$MAX_HEALTH_RETRIES" ]; do
            if health_check "$HEALTH_CHECK_URL"; then
                log_info "Health check passed after rollback"
                return 0
            fi
            retry=$((retry + 1))
            log_warn "Health check attempt $retry failed, retrying..."
            sleep "$HEALTH_CHECK_INTERVAL"
        done
        
        log_error "Health check failed after rollback"
        return 1
    else
        log_error "Rollback failed to stabilize within timeout"
        return 1
    fi
}

# Auto-rollback based on health check failure
auto_rollback() {
    log_info "Starting auto-rollback process..."
    
    local current_task=$(get_current_task_definition)
    log_info "Current task definition: $current_task"
    
    local previous_task=$(get_previous_task_definition "$current_task")
    if [ $? -ne 0 ]; then
        log_error "Failed to determine previous task definition"
        exit 1
    fi
    log_info "Previous task definition: $previous_task"
    
    # Verify previous task definition exists
    if ! aws ecs describe-task-definition --task-definition "$previous_task" > /dev/null 2>&1; then
        log_error "Previous task definition does not exist: $previous_task"
        exit 1
    fi
    
    perform_rollback "$previous_task"
}

# Manual rollback to specific revision
manual_rollback() {
    local target_revision="$1"
    
    if [ -z "$target_revision" ]; then
        log_error "Target revision not specified"
        echo "Usage: $0 manual <task-definition-arn>"
        exit 1
    fi
    
    log_info "Starting manual rollback to: $target_revision"
    perform_rollback "$target_revision"
}

# List available task definitions for rollback
list_revisions() {
    local family="${SERVICE_NAME}"
    
    log_info "Available task definitions for $family:"
    aws ecs list-task-definitions \
        --family-prefix "$family" \
        --sort DESC \
        --max-items 10 \
        --query 'taskDefinitionArns[]' \
        --output table
}

# Main
case "${1:-auto}" in
    auto)
        auto_rollback
        ;;
    manual)
        manual_rollback "$2"
        ;;
    list)
        list_revisions
        ;;
    health)
        if health_check "$HEALTH_CHECK_URL"; then
            log_info "Health check passed"
            exit 0
        else
            log_error "Health check failed"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {auto|manual <task-def-arn>|list|health}"
        echo ""
        echo "Commands:"
        echo "  auto              - Automatically rollback to previous version"
        echo "  manual <arn>      - Rollback to specific task definition"
        echo "  list              - List available task definitions"
        echo "  health            - Check current health status"
        exit 1
        ;;
esac
