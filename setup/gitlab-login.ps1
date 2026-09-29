# GitLab login for command-line git (and the AI in the web chat), opened in Google Chrome.
# 1) opens Chrome on GitLab's "new personal access token" page (name + scopes pre-filled)
# 2) asks for your GitLab username + the token (hidden) and saves them in Windows Credential Manager
# 3) tests access to every GitLab repo it finds next to the mcp folder
# Usage: powershell -ExecutionPolicy Bypass -File D:\mcp\setup\gitlab-login.ps1 [-Host gitlab.com]
param([string]$GitHost = 'gitlab.com')

$ErrorActionPreference = 'Stop'
$tokenUrl = "https://$GitHost/-/user_settings/personal_access_tokens?name=git-cli-$env:COMPUTERNAME&scopes=read_repository,write_repository"

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

Write-Host "=== GitLab login ($GitHost) ===" -ForegroundColor Cyan
if ($chrome) { Start-Process $chrome $tokenUrl; Write-Host "Opened Chrome: sign in, keep the scopes read_repository + write_repository, click 'Create token', copy it." }
else { Start-Process $tokenUrl; Write-Host "Chrome not found - opened the default browser instead." -ForegroundColor Yellow }
Write-Host ""

$user = (Read-Host "GitLab username").Trim()
if (-not $user) { Write-Host "Username is empty" -ForegroundColor Red; exit 1 }
$secure = Read-Host "Personal access token (hidden)" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $token) { Write-Host "Token is empty" -ForegroundColor Red; exit 1 }

# Replace any old entry for this host, then store the new one in Git Credential Manager
"protocol=https`nhost=$GitHost`n`n" | git credential reject 2>$null
"protocol=https`nhost=$GitHost`nusername=$user`npassword=$token`n`n" | git credential approve
Write-Host "Saved to Windows Credential Manager (git:https://$GitHost)." -ForegroundColor Green

# Test every repo beside the mcp folder whose origin is on this host - without any prompt
$env:GIT_TERMINAL_PROMPT = '0'; $env:GCM_INTERACTIVE = 'never'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName '.git') } | ForEach-Object {
  $url = git -C $_.FullName remote get-url origin 2>$null
  if ($url -and $url -like "*$GitHost*") {
    git -C $_.FullName ls-remote --heads origin 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host ("[OK]   " + $_.Name) -ForegroundColor Green } else { Write-Host ("[FAIL] " + $_.Name + " - no access with this token") -ForegroundColor Red }
  }
}
Write-Host ""
Write-Host "Done. git pull now works in CMD and in the web chat (full / auto mode). You can close this window."
