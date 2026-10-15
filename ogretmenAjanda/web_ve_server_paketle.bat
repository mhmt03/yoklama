@echo off
chcp 65001 > nul
title Ogretmen Ajandasi - Web ve Sunucu Paketleme Araci
echo ============================================================
echo   OGRETMEN AJANDASI: WEB + API TEK PAKET HALINE GETIRILIYOR
echo ============================================================
echo.

echo [1/3] Expo Web Arayuzu Derleniyor (HTML/JS/CSS)...
call npx expo export --platform web
if %errorlevel% neq 0 (
    echo [HATA] Web derlemesi basarisiz oldu!
    pause
    exit /b %errorlevel%
)
echo.

echo [2/3] Web dosyalari API wwwroot klasorune aktariliyor...
if not exist "server\OgretmenAjanda.Api\wwwroot" mkdir "server\OgretmenAjanda.Api\wwwroot"
xcopy /E /Y /I "dist\*" "server\OgretmenAjanda.Api\wwwroot\"
echo.

echo [3/3] .NET Web API yayin paketi hazirlaniyor (dotnet publish)...
cd server\OgretmenAjanda.Api
dotnet publish -c Release -o ./publish
cd ..\..
if %errorlevel% neq 0 (
    echo [HATA] API publish islemi basarisiz oldu!
    pause
    exit /b %errorlevel%
)

echo [EK] Web ve wasm varliklari publish klasorune senkronize ediliyor...
xcopy /E /Y /I "dist\*" "server\OgretmenAjanda.Api\publish\wwwroot\"
echo.

echo ============================================================
echo   TEBRIKLER! YAYIN PAKETI HAZIRLANDI!
echo ============================================================
echo Dosyalariniz su klasorde hazir:
echo   - server\OgretmenAjanda.Api\publish\
echo.
echo Yapmaniz gereken tek sey:
echo   "server\OgretmenAjanda.Api\publish\" klasorunun icindeki
echo   tum dosyalari sunucunuzun (ornegin MonsterASP / IIS)
echo   web kok (wwwroot) dizinine yuklemektir.
echo ============================================================
if "%~1"=="" pause
