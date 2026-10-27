@echo off
chcp 65001 > nul
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
echo Servisler (API ve Expo) baslatiliyor, lutfen bekleyin...
echo.
npm run dev
pause
