## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation update
- [ ] 🔧 Configuration change
- [ ] ♻️ Refactoring (no functional changes)
- [ ] 🧪 Test update

## Related Issues

<!-- Link any related issues using "Fixes #123" or "Relates to #123" -->

Fixes #

## Changes Made

<!-- List the specific changes made in this PR -->

- 
- 
- 

## Testing

### Test Coverage

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Property-based tests added/updated (if applicable)
- [ ] Manual testing completed

### Test Results

<!-- Paste test output or describe manual testing performed -->

```
npm test output here
```

## Deployment Checklist

### Target Environment
- [ ] Development (`develop` branch)
- [ ] Staging (`staging` branch)
- [ ] Production (`main` branch)

### Pre-Deployment Verification
- [ ] All CI checks passing
- [ ] Code review approved
- [ ] No merge conflicts
- [ ] Branch is up to date with target

### Backend Changes
- [ ] Database migrations included (if schema changes)
- [ ] Migration rollback tested
- [ ] Environment variables documented in `.env.example`
- [ ] New secrets added to AWS Secrets Manager
- [ ] API documentation updated
- [ ] No secrets in code
- [ ] Health check endpoint verified

### Frontend Changes
- [ ] Responsive design verified
- [ ] Accessibility checked (WCAG 2.1 AA)
- [ ] Browser compatibility tested (Chrome, Firefox, Safari, Edge)
- [ ] Performance impact assessed
- [ ] Lighthouse score maintained (>80)
- [ ] CDN cache invalidation considered

### Mobile Changes
- [ ] iOS build tested
- [ ] Android build tested
- [ ] Offline functionality verified
- [ ] Push notifications tested (if applicable)
- [ ] OTA update compatible (JS-only changes)
- [ ] App version bumped (if native changes)

### Post-Deployment Verification
- [ ] Smoke tests planned
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

## Security Checklist

- [ ] No sensitive data logged
- [ ] Input validation implemented
- [ ] Authentication/authorization verified
- [ ] No hardcoded secrets or API keys
- [ ] Security scan passed (`npm audit`)

## Screenshots/Videos

<!-- Add screenshots or videos for UI changes -->

## Reviewer Notes

<!-- Any specific areas you'd like reviewers to focus on -->

---

**By submitting this PR, I confirm that:**
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
