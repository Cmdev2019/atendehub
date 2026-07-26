# Sobe a API de dev (apps/api, porta 3001) numa janela dedicada, matando
# antes qualquer instância anterior com o mesmo título/script — sem isso,
# duas janelas "AtendeHub API" abertas em sessões diferentes brigam pela
# porta 3001 e uma delas fica com o processo vivo mas sem responder,
# parecendo uma queda (ver ROADMAP_ESTABILIZACAO.md B-37).
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object {
        $_.ProcessId -ne $PID -and
        ($_.CommandLine -like '*AtendeHub API*' -or $_.CommandLine -like '*dev-api.ps1*')
    } |
    ForEach-Object {
        Write-Host "Encerrando instância anterior da API (PID $($_.ProcessId))..."
        taskkill /F /T /PID $_.ProcessId 2>$null
    }

Start-Sleep -Milliseconds 500

$host.ui.RawUI.WindowTitle = 'AtendeHub API'
Set-Location (Join-Path $PSScriptRoot '..\apps\api')
npm run start:dev
