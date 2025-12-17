---
name: Hotfix Request
about: Request an urgent production hotfix
title: '[HOTFIX] '
labels: hotfix, urgent, production
assignees: ''
---

## Hotfix Summary

<!-- Brief description of the critical issue requiring a hotfix -->

## Severity

- [ ] 🔴 P0 - System down / Data loss / Security breach
- [ ] 🟠 P1 - Major feature broken for all users
- [ ] 🟡 P2 - Major feature broken for some users

## Affected Systems

- [ ] Backend API
- [ ] Frontend Web
- [ ] Mobile App (iOS)
- [ ] Mobile App (Android)
- [ ] Database
- [ ] Third-party integrations

## Issue Description

### What is broken?
<!-- Describe the issue in detail -->

### User Impact
<!-- How many users are affected? What can't they do? -->

### Business Impact
<!-- Revenue loss, reputation damage, compliance issues, etc. -->

## Root Cause (if known)

<!-- What caused this issue? -->

## Proposed Fix

<!-- Describe the fix you're proposing -->

### Code Changes Required
<!-- List files/components that need to be changed -->

- 
- 

### Database Changes Required
- [ ] No database changes
- [ ] Migration required (describe below)

### Rollback Plan

<!-- How do we rollback if the fix causes more issues? -->

## Testing Plan

### Pre-deployment Testing
- [ ] Unit tests updated
- [ ] Manual testing on staging
- [ ] Smoke test plan ready

### Post-deployment Verification
- [ ] Health checks to monitor
- [ ] Metrics to watch
- [ ] User flows to verify

## Deployment Plan

### Deployment Window
<!-- When should this be deployed? -->

### Required Approvals
- [ ] Engineering Lead
- [ ] On-call Engineer
- [ ] Product Owner (if applicable)

### Communication Plan
- [ ] Status page updated
- [ ] Customer support notified
- [ ] Stakeholders informed

## Timeline

| Action | Time | Owner |
|--------|------|-------|
| Issue identified | | |
| Fix developed | | |
| Fix tested | | |
| Deployed to staging | | |
| Deployed to production | | |
| Verified in production | | |

## Post-Incident

- [ ] Post-mortem scheduled
- [ ] Documentation updated
- [ ] Monitoring improved
