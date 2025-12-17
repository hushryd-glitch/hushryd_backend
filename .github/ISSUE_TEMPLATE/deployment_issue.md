---
name: Deployment Issue
about: Report a deployment or CI/CD pipeline issue
title: '[DEPLOY] '
labels: deployment, ci-cd, triage
assignees: ''
---

## Deployment Issue Summary

<!-- A clear description of the deployment issue -->

## Pipeline/Environment

### Affected Pipeline
- [ ] Backend CI
- [ ] Backend CD
- [ ] Frontend CI
- [ ] Frontend CD
- [ ] Mobile CI/CD
- [ ] EAS Build

### Environment
- [ ] Development
- [ ] Staging
- [ ] Production

## Issue Type

- [ ] 🔴 Build failure
- [ ] 🟠 Deployment failure
- [ ] 🟡 Test failure
- [ ] 🔵 Configuration issue
- [ ] ⚪ Performance degradation
- [ ] 🟣 Rollback needed

## Details

### Commit/PR Reference
<!-- Link to the commit or PR that triggered the issue -->
- Commit SHA: 
- PR Number: #
- Branch: 

### Workflow Run
<!-- Link to the failed GitHub Actions run -->
- Run URL: 

### Error Message

```
Paste error logs here
```

## Steps to Reproduce

1. Push to branch '...'
2. Workflow '...' triggers
3. Step '...' fails
4. Error occurs

## Expected Behavior

<!-- What should have happened -->

## Actual Behavior

<!-- What actually happened -->

## Impact Assessment

- [ ] Blocking production deployment
- [ ] Blocking staging deployment
- [ ] Blocking development work
- [ ] Non-blocking (can work around)

## Attempted Solutions

<!-- What have you tried to fix this? -->

1. 
2. 

## Additional Context

<!-- Any other relevant information -->

## Urgency

- [ ] 🔴 Critical (production down, immediate fix needed)
- [ ] 🟠 High (blocking release)
- [ ] 🟡 Medium (affecting team productivity)
- [ ] 🟢 Low (can wait for next sprint)
