Set-Location $PSScriptRoot
Write-Host "Calendar Todo 시작 중..." -ForegroundColor Cyan

$npm = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $npm)) {
    Write-Host "[오류] Node.js를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "https://nodejs.org 에서 설치해주세요."
    Read-Host "Enter를 눌러 닫기"
    exit
}

if (-not (Test-Path "node_modules")) {
    Write-Host "첫 실행: 패키지 설치 중..." -ForegroundColor Yellow
    & $npm install
}

Write-Host "앱 실행 중..." -ForegroundColor Green
& $npm start
