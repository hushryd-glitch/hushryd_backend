# Branch Protection Rules

This document describes the branch protection rules that should be configured in GitHub repository settings.

## Protected Branches

### `main` (Production)

Navigate to: Settings → Branches → Add branch protection rule

**Branch name pattern:** `main`

**Protection settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 2
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required status checks:
    - `backend-ci / test`
    - `frontend-ci / test`
    - `mobile-ci / test`
    - `security-scan`
- ✅ Require conversation resolution before merging
- ✅ Require signed commits (recommended)
- ✅ Require linear history
- ✅ Do not allow bypassing the above settings
- ✅ Restrict who can push to matching branches
  - Only allow: `release-managers` team

### `staging` (Pre-Production)

**Branch name pattern:** `staging`

**Protection settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
  - ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - Required status checks:
    - `backend-ci / test`
    - `frontend-ci / test`
    - `mobile-ci / test`
- ✅ Require conversation resolution before merging

### `develop` (Integration)

**Branch name pattern:** `develop`

**Protection settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
- ✅ Require status checks to pass before merging
  - Required status checks:
    - `backend-ci / test`
    - `frontend-ci / test`
    - `mobile-ci / test`

## Branch Naming Convention

All feature branches must follow these naming patterns:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/*` | `feature/user-authentication` |
| Bug Fix | `bugfix/*` | `bugfix/booking-validation` |
| Hot Fix | `hotfix/*` | `hotfix/critical-security-patch` |
| Release | `release/*` | `release/v1.2.0` |

## Merge Strategy

- **develop → staging**: Squash and merge
- **staging → main**: Create a merge commit
- **hotfix → main**: Create a merge commit (requires expedited review)

## Environment Deployments

| Branch | Environment | Auto-Deploy |
|--------|-------------|-------------|
| `develop` | Development | ✅ Yes |
| `staging` | Staging | ✅ Yes (after approval) |
| `main` | Production | ⚠️ Manual approval required |
