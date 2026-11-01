@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Ogretmen Ajandasi Gelistirici Ortami

set LOCAL_IP=192.168.1.154
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi*,Ethernet* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1)"') do (
    if not "%%a"=="" set LOCAL_IP=%%a
)

cls
echo ============================================================
echo   OGRETMEN AJANDASI: GELİSTİRİCİ ÇALISMA ORTAMI
echo ============================================================
echo.
echo   💻 Web Arayüzü / API:     http://localhost:5079
echo   📱 BlueStacks / Expo Go:  exp://%LOCAL_IP%:8081
echo   🌐 Yerel Mobil API:        http://%LOCAL_IP%:5079/api
echo.
echo ============================================================
echo   BLUESTACKS'TE UYGULAMAYI AÇMAK İÇİN:
echo   1. BlueStacks içinde 'Expo Go' uygulamasını açın.
echo   2. 'Enter URL manually' seçeneğine tıklayın.
echo   3. exp://%LOCAL_IP%:8081 yazıp 'Connect'e basın.
echo.
echo   YENİ SÜRÜMLÜ APK ÜRETMEK İÇİN:
echo   Çift tıkla:  apk_uret.bat  (veya terminalde: npm run build:apk)
echo   Çıktı Dosyası: ogretmenajanda.apk (Sürüm otomatik artırılır)
echo ============================================================
echo.

echo [1/3] Acik kalan eski sunucu surecleri (Port 5079 ve 8081) kontrol ediliyor ve kapatiliyor...
powershell -NoProfile -Command ^
  "$ports = @(5079, 8081); " ^
  "foreach ($p in $ports) { " ^
  "  $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; " ^
  "  if ($conns) { " ^
  "    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "    foreach ($id in $pids) { " ^
  "      if ($id -gt 4) { " ^
  "        Write-Host ('  -> Port ' + $p + ' uzerindeki surec (PID: ' + $id + ') sonlandiriliyor...'); " ^
  "        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; " ^
  "      } " ^
  "    } " ^
  "  } " ^
  "} " ^
  "Stop-Process -Name 'OgretmenAjanda.Api' -Force -ErrorAction SilentlyContinue;"

echo.
echo [2/3] Web arayuzu (wwwroot) guncellik kontrolu yapiliyor...
powershell -NoProfile -Command ^
  "$idx = 'server\OgretmenAjanda.Api\wwwroot\index.html'; " ^
  "$needBuild = $false; " ^
  "if (!(Test-Path $idx)) { $needBuild = $true } else { " ^
  "  $idxTime = (Get-Item $idx).LastWriteTime; " ^
  "  $newer = Get-ChildItem -Path 'src','App.tsx' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $idxTime } | Select-Object -First 1; " ^
  "  if ($newer) { $needBuild = $true } " ^
  "} " ^
  "if ($needBuild) { exit 10 } else { exit 0 }"

if %ERRORLEVEL%==10 (
    echo   -> Kaynak kodda degisiklik tespit edildi, web arayuzu derleniyor...
    call npx expo export --platform web
    if exist "dist\index.html" (
        powershell -NoProfile -Command ^
          "Remove-Item 'server\OgretmenAjanda.Api\wwwroot\_expo' -Recurse -Force -ErrorAction SilentlyContinue; " ^
          "Copy-Item 'dist\*' 'server\OgretmenAjanda.Api\wwwroot\' -Recurse -Force; " ^
          "Remove-Item 'dist' -Recurse -Force;"
        echo   -> Web arayuzu (wwwroot) basariyla guncellendi.
    )
) else (
    echo   -> Web arayuzu (wwwroot) zaten guncel.
)

echo.
echo [3/3] Servisler (API ve Expo) baslatiliyor, lutfen bekleyin...
echo.
npm run dev
pause
