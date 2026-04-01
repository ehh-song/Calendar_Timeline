# 이 스크립트를 실행하면:
# 1. 바탕화면에 바로가기 생성
# 2. Windows 시작 시 자동 실행 등록

$appDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronExe = Join-Path $appDir "node_modules\electron\dist\electron.exe"

if (-not (Test-Path $electronExe)) {
    Write-Host "[오류] Electron이 없습니다. 먼저 '앱 실행.ps1'을 한 번 실행해주세요." -ForegroundColor Red
    Read-Host "Enter를 눌러 닫기"
    exit
}

$shell = New-Object -ComObject WScript.Shell

# ── 1. 바탕화면 바로가기 ──────────────────────────────────────────
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$desktopShortcut = Join-Path $desktopPath "Calendar Todo.lnk"

$sc = $shell.CreateShortcut($desktopShortcut)
$sc.TargetPath       = $electronExe
$sc.Arguments        = "`"$appDir`""
$sc.WorkingDirectory = $appDir
$sc.Description      = "Calendar Todo Widget"
$sc.Save()

Write-Host "바탕화면 바로가기 생성 완료" -ForegroundColor Green

# ── 2. 시작프로그램 등록 ──────────────────────────────────────────
$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$startupShortcut = Join-Path $startupFolder "Calendar Todo.lnk"

$sc2 = $shell.CreateShortcut($startupShortcut)
$sc2.TargetPath       = $electronExe
$sc2.Arguments        = "`"$appDir`""
$sc2.WorkingDirectory = $appDir
$sc2.Description      = "Calendar Todo Widget"
$sc2.Save()

Write-Host "Windows 시작 시 자동 실행 등록 완료" -ForegroundColor Green
Write-Host ""
Write-Host "바탕화면의 'Calendar Todo' 아이콘으로 실행하거나," -ForegroundColor Cyan
Write-Host "다음 Windows 로그인부터 자동으로 실행됩니다." -ForegroundColor Cyan
Write-Host ""
Read-Host "Enter를 눌러 닫기"
