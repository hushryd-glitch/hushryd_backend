#!/bin/bash
# HushRyd Backend Health Check Script
# Used for deployment validation and ALB health checks
# Requirements: 2.4, 12.1

set -e

# Configuration
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
DEEP_HEALTH_URL="${DEEP_HEALTH_URL:-http://localhost:3000/health/deep}"
READY_URL="${READY_URL:-http://localhost:3000/ready}"
MAX_RETRIES="${MAX_RETRIES:-10}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"
TIMEOUT="${TIMEOUT:-5}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Basic health check (for ALB)
basic_health_check() {
    local url="$1"
    local response
    local http_code
    
    response=$(curl -s --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        local status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "unknown")
        if [ "$status" = "ok" ]; then
            log_info "Basic health check passed (status: $status)"
            return 0
        fi
    fi
    
    log_error "Basic health check failed (HTTP: $http_code)"
    return 1
}

# Deep health check (for deployment validation)
deep_health_check() {
    local url="$1"
    local response
    local http_code
    
    response=$(curl -s --connect-timeout "$TIMEOUT" --max-time 30 "$url" 2>/dev/null)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time 30 "$url" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        local status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "unknown")
        local db_status=$(echo "$response" | jq -r '.checks.database.status' 2>/dev/null || echo "unknown")
        
        log_info "Deep health check results:"
        log_info "  Overall status: $status"
        log_info "  Database: $db_status"
        
        if [ "$status" = "ok" ] && [ "$db_status" = "ok" ]; then
            log_info "Deep health check passed"
            return 0
        elif [ "$status" = "degraded" ]; then
            log_warn "Service is degraded but running"
            return 0
        fi
    fi
    
    log_error "Deep health check failed (HTTP: $http_code)"
    return 1
}

# Readiness check
readiness_check() {
    local url="$1"
    local response
    local http_code
    
    response=$(curl -s --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        local ready=$(echo "$response" | jq -r '.ready' 2>/dev/null || echo "false")
        if [ "$ready" = "true" ]; then
            log_info "Readiness check passed"
            return 0
        fi
    fi
    
    log_error "Readiness check failed (HTTP: $http_code)"
    return 1
}

# Wait for service to be healthy
wait_for_healthy() {
    local check_type="$1"
    local url="$2"
    local retry=0
    
    log_info "Waiting for service to be healthy (max retries: $MAX_RETRIES)..."
    
    while [ "$retry" -lt "$MAX_RETRIES" ]; do
        retry=$((retry + 1))
        log_info "Attempt $retry of $MAX_RETRIES..."
        
        case "$check_type" in
            basic)
                if basic_health_check "$url"; then
                    return 0
                fi
                ;;
            deep)
                if deep_health_check "$url"; then
                    return 0
                fi
                ;;
            ready)
                if readiness_check "$url"; then
                    return 0
                fi
                ;;
        esac
        
        if [ "$retry" -lt "$MAX_RETRIES" ]; then
            log_info "Retrying in ${RETRY_INTERVAL}s..."
            sleep "$RETRY_INTERVAL"
        fi
    done
    
    log_error "Service failed to become healthy after $MAX_RETRIES attempts"
    return 1
}

# Full deployment validation
deployment_validation() {
    log_info "Running full deployment validation..."
    
    # Step 1: Basic health check
    log_info "Step 1: Basic health check"
    if ! wait_for_healthy "basic" "$HEALTH_URL"; then
        log_error "Basic health check failed"
        return 1
    fi
    
    # Step 2: Readiness check
    log_info "Step 2: Readiness check"
    if ! wait_for_healthy "ready" "$READY_URL"; then
        log_error "Readiness check failed"
        return 1
    fi
    
    # Step 3: Deep health check
    log_info "Step 3: Deep health check"
    if ! wait_for_healthy "deep" "$DEEP_HEALTH_URL"; then
        log_error "Deep health check failed"
        return 1
    fi
    
    log_info "All deployment validation checks passed!"
    return 0
}

# Main
case "${1:-basic}" in
    basic)
        basic_health_check "${2:-$HEALTH_URL}"
        ;;
    deep)
        deep_health_check "${2:-$DEEP_HEALTH_URL}"
        ;;
    ready)
        readiness_check "${2:-$READY_URL}"
        ;;
    wait)
        wait_for_healthy "${2:-basic}" "${3:-$HEALTH_URL}"
        ;;
    validate)
        deployment_validation
        ;;
    *)
        echo "Usage: $0 {basic|deep|ready|wait|validate} [url]"
        echo ""
        echo "Commands:"
        echo "  basic [url]       - Run basic health check"
        echo "  deep [url]        - Run deep health check with dependency checks"
        echo "  ready [url]       - Run readiness check"
        echo "  wait <type> [url] - Wait for service to be healthy"
        echo "  validate          - Run full deployment validation"
        echo ""
        echo "Environment variables:"
        echo "  HEALTH_URL        - Basic health check URL (default: http://localhost:3000/health)"
        echo "  DEEP_HEALTH_URL   - Deep health check URL (default: http://localhost:3000/health/deep)"
        echo "  READY_URL         - Readiness check URL (default: http://localhost:3000/ready)"
        echo "  MAX_RETRIES       - Maximum retry attempts (default: 10)"
        echo "  RETRY_INTERVAL    - Seconds between retries (default: 5)"
        exit 1
        ;;
esac
