# Sobe o front de dev (raiz, porta 3000) numa janela dedicada, matando
# antes qualquer instância anterior com o mesmo título/script — mesmo
# racional do dev-api.ps1 (ver ROADMAP_ESTABILIZACAO.md B-37).
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object {
        $_.ProcessId -ne $PID -and
        ($_.CommandLine -like '*AtendeHub Front*' -or $_.CommandLine -like '*dev-front.ps1*')
    } |
    ForEach-Object {
        Write-Host "Encerrando instância anterior do front (PID $($_.ProcessId))..."
        taskkill /F /T /PID $_.ProcessId 2>$null
    }

Start-Sleep -Milliseconds 500

$host.ui.RawUI.WindowTitle = 'AtendeHub Front'
Set-Location (Join-Path $PSScriptRoot '..')
npm run dev
