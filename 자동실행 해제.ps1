$startupShortcut = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Calendar Todo.lnk"

if (Test-Path $startupShortcut) {
    Remove-Item $startupShortcut -Force
    Write-Host "자동 실행 해제 완료" -ForegroundColor Yellow
} else {
    Write-Host "자동 실행이 등록되어 있지 않습니다." -ForegroundColor Gray
}

Read-Host "Enter를 눌러 닫기"
