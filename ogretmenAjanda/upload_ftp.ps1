param(
    [string]$FtpHost = "site99031.siteasp.net",
    [string]$FtpUser = "site99031",
    [string]$FtpPass = "Gundoner.1",
    [switch]$UploadDatabase = $false
)

function Upload-File([string]$localPath, [string]$remotePath) {
    $uri = "ftp://$FtpHost$remotePath"
    $req = [System.Net.FtpWebRequest]::Create($uri)
    $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
    $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $req.UseBinary = $true
    $req.UsePassive = $true
    $req.Timeout = 60000
    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $req.ContentLength = $bytes.Length
    $st = $req.GetRequestStream()
    $st.Write($bytes, 0, $bytes.Length)
    $st.Close()
    $resp = $req.GetResponse()
    $resp.Close()
    Write-Host "Yuklendi: $remotePath ($([math]::Round($bytes.Length/1KB, 1)) KB)" -ForegroundColor Green
}

function Make-Dir([string]$remotePath) {
    $uri = "ftp://$FtpHost$remotePath"
    try {
        $req = [System.Net.FtpWebRequest]::Create($uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $req.UsePassive = $true
        $resp = $req.GetResponse()
        $resp.Close()
    } catch {}
}

function Delete-File([string]$remotePath) {
    $uri = "ftp://$FtpHost$remotePath"
    try {
        $req = [System.Net.FtpWebRequest]::Create($uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
        $req.UsePassive = $true
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "Silindi: $remotePath" -ForegroundColor Yellow
    } catch {}
}

Write-Host "1. Kilit Acma: app_offline.htm yukleniyor..." -ForegroundColor Yellow
$offlineTemp = Join-Path $env:TEMP "app_offline.htm"
"<!DOCTYPE html><html><head><meta charset='utf-8'><title>Guncelleniyor</title></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>Sistem Guncelleniyor... Lutfen bekleyiniz.</h2></body></html>" | Out-File -FilePath $offlineTemp -Encoding utf8
Upload-File -localPath $offlineTemp -remotePath "/wwwroot/app_offline.htm"
Start-Sleep -Seconds 3

if ($UploadDatabase) {
    Write-Host "2. Veritabani (ogretmenajanda.db) yukleniyor..." -ForegroundColor Cyan
    $dbLocal = "f:\mehmetg_gmail\developing\react\ogretmenAjanda\scratch\live_ogretmenajanda.db"
    if (Test-Path $dbLocal) {
        Upload-File -localPath $dbLocal -remotePath "/wwwroot/ogretmenajanda.db"
        Write-Host "Veritabani basariyla guncellendi!" -ForegroundColor Green
    }
} else {
    Write-Host "2. Veritabani yuklemesi ATLANDI (yalnizca kod dagitimi)." -ForegroundColor Gray
}

Write-Host "3. API DLL ve PDB yukleniyor..." -ForegroundColor Cyan
$publishDir = "f:\mehmetg_gmail\developing\react\ogretmenAjanda\server\OgretmenAjanda.Api\publish"
$dll = Join-Path $publishDir "OgretmenAjanda.Api.dll"
$pdb = Join-Path $publishDir "OgretmenAjanda.Api.pdb"
if (Test-Path $dll) { Upload-File -localPath $dll -remotePath "/wwwroot/OgretmenAjanda.Api.dll" }
if (Test-Path $pdb) { Upload-File -localPath $pdb -remotePath "/wwwroot/OgretmenAjanda.Api.pdb" }

Write-Host "4. Dizinler kontrol ediliyor..." -ForegroundColor Cyan
Make-Dir "/wwwroot/wwwroot"
$distDir = (Get-Item "dist").FullName
$subDirs = Get-ChildItem -Path "dist" -Recurse -Directory | Sort-Object { $_.FullName.Length }
foreach ($d in $subDirs) {
    $relDir = $d.FullName.Substring($distDir.Length).Replace("\", "/")
    Make-Dir "/wwwroot$relDir"
    Make-Dir "/wwwroot/wwwroot$relDir"
}

Write-Host "4. Guncel Web JS ve HTML dosyalari yukleniyor..." -ForegroundColor Cyan
$distFiles = Get-ChildItem -Path "dist" -Recurse -File
foreach ($f in $distFiles) {
    $rel = $f.FullName.Substring($distDir.Length).Replace("\", "/")
    # Hem kok /wwwroot hem de /wwwroot/wwwroot altina yukle
    try { Upload-File -localPath $f.FullName -remotePath "/wwwroot$rel" } catch { Write-Host "Hata: /wwwroot$rel : $($_.Exception.Message)" -ForegroundColor Red }
    try { Upload-File -localPath $f.FullName -remotePath "/wwwroot/wwwroot$rel" } catch { Write-Host "Hata: /wwwroot/wwwroot$rel : $($_.Exception.Message)" -ForegroundColor Red }
}

Write-Host "5. app_offline.htm silinerek canli site aciliyor..." -ForegroundColor Cyan
Delete-File "/wwwroot/app_offline.htm"
Delete-File "/wwwroot/wwwroot/app_offline.htm"

Start-Sleep -Seconds 3

Write-Host "6. Canli Sunucu Saglik Testi..." -ForegroundColor Cyan
try {
    $res = Invoke-RestMethod -Uri "http://ogretmenajanda.runasp.net/health" -Method Get -TimeoutSec 15
    Write-Host "CANLI SUNUCU BASARIYLA ACILDI: $($res | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "Uyari: $($_.Exception.Message)" -ForegroundColor Yellow
}
