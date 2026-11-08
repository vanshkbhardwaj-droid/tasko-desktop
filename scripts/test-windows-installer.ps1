[CmdletBinding()]
param(
  [string]$ReleaseDirectory = (Join-Path $PSScriptRoot "..\release")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$releasePath = (Resolve-Path $ReleaseDirectory).Path
$installers = @(Get-ChildItem -Path $releasePath -Recurse -File |
  Where-Object { $_.Name -match '^Tasko-.*-win-x64\.exe$' } |
  Sort-Object LastWriteTime -Descending)

if ($installers.Count -ne 1) {
  throw "Expected exactly one Tasko x64 NSIS installer in $releasePath; found $($installers.Count)."
}

$installer = $installers[0]
$installRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("TaskoSilentInstall-" + [guid]::NewGuid().ToString("N"))
$taskoExe = Join-Path $installRoot "Tasko.exe"
$uninstaller = Join-Path $installRoot "Uninstall Tasko.exe"
$firewallRuleName = "TaskoSmokeOffline-" + [guid]::NewGuid().ToString("N")
$firewallRuleCreated = $false
$startMenuRoots = @(
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
)
$startMenuCandidates = $startMenuRoots | ForEach-Object {
  @(
    (Join-Path $_ "Tasko.lnk"),
    (Join-Path $_ "Tasko\Tasko.lnk")
  )
}

try {
  # NSIS requires /D=<absolute directory> to be the final installer argument.
  $install = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installRoot") -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Silent installer exited with code $($install.ExitCode)." }
  if (-not (Test-Path -LiteralPath $taskoExe -PathType Leaf)) { throw "Tasko.exe was not installed at $taskoExe." }
  $startMenuShortcut = $startMenuCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $startMenuShortcut) {
    throw "The installer did not create the Tasko Start Menu shortcut."
  }
  $shortcutTarget = (New-Object -ComObject WScript.Shell).CreateShortcut($startMenuShortcut).TargetPath
  if ([System.IO.Path]::GetFullPath($shortcutTarget) -ne [System.IO.Path]::GetFullPath($taskoExe)) {
    throw "The Tasko Start Menu shortcut does not target the tested install."
  }

  # Restrict this exact installed executable before launch. Electron renderer
  # processes use Tasko.exe too, so this checks that the standalone app opens
  # without any outbound network path.
  New-NetFirewallRule -Name $firewallRuleName -DisplayName $firewallRuleName -Direction Outbound -Program $taskoExe -Action Block -Profile Any -Enabled True | Out-Null
  $firewallRuleCreated = $true
  $app = Start-Process -FilePath $taskoExe -PassThru
  Start-Sleep -Seconds 8
  $app.Refresh()
  if ($app.HasExited) { throw "Tasko.exe exited during the offline standalone launch smoke test (exit code $($app.ExitCode))." }
  Stop-Process -Id $app.Id -Force
  $app.WaitForExit()

  $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @("/S") -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Silent uninstaller exited with code $($uninstall.ExitCode)." }
  if (Test-Path -LiteralPath $taskoExe -PathType Leaf) { throw "Tasko.exe remains after silent uninstall." }

  Write-Host "Windows installer smoke test passed: install, Start Menu shortcut, offline standalone launch, and uninstall."
} finally {
  if ($firewallRuleCreated) {
    Remove-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
