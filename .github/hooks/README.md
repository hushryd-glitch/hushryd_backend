# Git Hooks

This directory contains Git hooks for the HushRyd repository.

## Installation

To install the hooks, run the following commands from the repository root:

```bash
# Make the pre-commit hook executable
chmod +x .github/hooks/pre-commit

# Copy to .git/hooks directory
cp .github/hooks/pre-commit .git/hooks/pre-commit
```

Or use this one-liner:

```bash
cp .github/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

## Available Hooks

### pre-commit

Scans staged files for potential secrets before allowing a commit. This helps prevent accidental exposure of:

- AWS access keys and secrets
- API keys (generic, Twilio, SendGrid, Stripe, Razorpay)
- JWT secrets
- Private keys (RSA, DSA, PGP)
- MongoDB connection strings with credentials
- Passwords
- Bearer tokens
- Google API keys

### Bypassing Hooks

If you need to bypass the hook (e.g., for a false positive), use:

```bash
git commit --no-verify
```

**⚠️ Use with caution!** Only bypass if you're certain there are no real secrets.

## Automated Setup

For new team members, consider adding this to your onboarding script:

```bash
#!/bin/bash
# setup-hooks.sh
echo "Setting up Git hooks..."
cp .github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✓ Git hooks installed"
```
