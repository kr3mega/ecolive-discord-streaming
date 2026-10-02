# EcoLive - Criar Atalhos na Area de Trabalho
$wscript = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$projectRoot = $PSScriptRoot

# Atalho 1: Iniciar Servidor
$startShortcut = $wscript.CreateShortcut("$desktop\Iniciar Servidor EcoLive.lnk")
$startShortcut.TargetPath = "$projectRoot\iniciar-servidor.bat"
$startShortcut.WorkingDirectory = $projectRoot
$startShortcut.Description = "Iniciar Servidor de Streaming EcoLive"
$startShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,137" # Icone de play/executar verde
$startShortcut.Save()

# Atalho 2: Parar Servidor
$stopShortcut = $wscript.CreateShortcut("$desktop\Parar Servidor EcoLive.lnk")
$stopShortcut.TargetPath = "$projectRoot\parar-servidor.bat"
$stopShortcut.WorkingDirectory = $projectRoot
$stopShortcut.Description = "Parar Servidor de Streaming EcoLive"
$stopShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,131" # Icone de parada/cancelar vermelho
$stopShortcut.Save()

Write-Host "[OK] Atalhos criados na Area de Trabalho com sucesso!" -ForegroundColor Green
Write-Host " - $desktop\Iniciar Servidor EcoLive.lnk" -ForegroundColor Cyan
Write-Host " - $desktop\Parar Servidor EcoLive.lnk" -ForegroundColor Cyan
