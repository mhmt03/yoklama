# Stop-YoklamaWeb.ps1
# Terminates any running dotnet process that is hosting yoklamaWeb.dll to release file lock before build.

$processes = Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'"
foreach ($p in $processes) {
    if ($p.CommandLine -like '*yoklamaWeb.dll*') {
        Write-Host "Stopping process Id $($p.ProcessId) for $($p.CommandLine)"
        Stop-Process -Id $p.ProcessId -Force
    }
}
