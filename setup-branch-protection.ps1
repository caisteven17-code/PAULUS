# Run this script ONCE after installing and authenticating the GitHub CLI.
#
# Prerequisites:
#   1. Install gh CLI:  winget install --id GitHub.cli   (run as Administrator)
#   2. Authenticate:    gh auth login
#   3. Then run:        .\setup-branch-protection.ps1

$repo = "caisteven17-code/CAPSTONE-PROTOTYPE"
$branch = "main"

Write-Host "Setting up branch protection for $repo/$branch ..." -ForegroundColor Cyan

$body = @{
  required_status_checks = @{
    strict   = $true
    contexts = @(
      "Frontend (Lint + TypeScript)",
      "Backend (TypeScript Build)",
      "Analytics (Python Lint + Syntax)",
      "Security (No Secrets)",
      "SonarCloud Analysis"
    )
  }
  enforce_admins                  = $true
  required_pull_request_reviews   = @{
    required_approving_review_count = 1
    dismiss_stale_reviews           = $true
    require_code_owner_reviews      = $false
  }
  restrictions                    = $null
  allow_force_pushes              = $false
  allow_deletions                 = $false
} | ConvertTo-Json -Depth 10

gh api "repos/$repo/branches/$branch/protection" `
  --method PUT `
  --header "Accept: application/vnd.github+json" `
  --input - <<< $body

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nBranch protection enabled on '$branch'." -ForegroundColor Green
  Write-Host "- All 5 CI checks must pass before merging" -ForegroundColor Green
  Write-Host "- At least 1 approving review required" -ForegroundColor Green
  Write-Host "- Force pushes and branch deletion are blocked" -ForegroundColor Green
} else {
  Write-Host "`nFailed. Make sure you are authenticated: gh auth login" -ForegroundColor Red
}
