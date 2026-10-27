@echo off
chcp 65001 > nul
title Ogretmen Ajandasi - Otomatik Surumlu APK Derleyici
echo ============================================================
echo   OGRETMEN AJANDASI: OTOMATIK SURUMLU APK DERLEYICI
echo ============================================================
echo.

echo [1/3] Surum numarasi otomatik artiriliyor ve esitleniyor...
call node scripts/bump-version.js
if %errorlevel% neq 0 (
    echo [HATA] Surum artirma islemi basarisiz oldu!
    pause
    exit /b %errorlevel%
)
echo.

echo [2/3] Android APK derleniyor (gradlew assembleRelease)...
cd android
call gradlew.bat :app:assembleRelease
cd ..
if %errorlevel% neq 0 (
    echo [HATA] Gradle APK derlemesi basarisiz oldu!
    pause
    exit /b %errorlevel%
)
echo.

echo [3/3] Olusan APK sunucu wwwroot ve kok dizinlere kopyalaniyor...
set SRC_APK=android\app\build\outputs\apk\release\ogretmenajanda.apk
if not exist "%SRC_APK%" set SRC_APK=android\app\build\outputs\apk\release\app-release.apk

if exist "%SRC_APK%" (
    copy /Y "%SRC_APK%" "ogretmenajanda.apk" > nul
    copy /Y "%SRC_APK%" "server\OgretmenAjanda.Api\wwwroot\ogretmenajanda.apk" > nul
    copy /Y "%SRC_APK%" "server\OgretmenAjanda.Api\wwwroot\app-release.apk" > nul
    if exist "server\OgretmenAjanda.Api\publish\wwwroot" (
        copy /Y "%SRC_APK%" "server\OgretmenAjanda.Api\publish\wwwroot\ogretmenajanda.apk" > nul
        copy /Y "%SRC_APK%" "server\OgretmenAjanda.Api\publish\wwwroot\app-release.apk" > nul
    )
    echo [BASARILI] ogretmenajanda.apk hazirlandi ve server wwwroot klasorlerine aktarildi!
) else (
    echo [UYARI] Derlenen APK dosyasi bulunamadi: %SRC_APK%
)

echo.
echo ============================================================
echo   TEBRIKLER! YENI SURUMLU APK BASARIYLA DERLENDI!
echo ============================================================
echo Dosya Adi: ogretmenajanda.apk
echo.
echo Bu APK ve wwwroot dosyalarini FTP ile server'a yuklediginizde;
echo eski surumu kullanan kullanicilar uygulamayi actiklarinda
echo "Yeni Guncelleme Mevcut" uyarisi alarak otomatik olarak
echo bu yeni APK'yi indirmeye yonlendirileceklerdir.
echo ============================================================
if "%~1"=="" pause
