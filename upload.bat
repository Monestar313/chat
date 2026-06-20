@echo off
title رفع الملفات إلى alwaysdata
cd /d "%~dp0"

set USER=abdullah_
set HOST=ssh-account.alwaysdata.net
set REMOTE_DIR=/home/abdullah_/www/chat/

echo ================================
echo   🚀 رفع الملفات إلى alwaysdata
echo ================================
echo.
echo سيطلب منك كلمة السر SSH عدة مرات
echo.

echo 1. إنشاء المجلد البعيد...
ssh %USER%@%HOST% "mkdir -p %REMOTE_DIR%"

echo 2. رفع الملفات...
scp package.json %USER%@%HOST%:%REMOTE_DIR%
scp server.js %USER%@%HOST%:%REMOTE_DIR%
scp db.js %USER%@%HOST%:%REMOTE_DIR%
scp -r public %USER%@%HOST%:%REMOTE_DIR%
scp -r routes %USER%@%HOST%:%REMOTE_DIR%
scp -r middleware %USER%@%HOST%:%REMOTE_DIR%

echo 3. تثبيت المكتبات...
ssh %USER%@%HOST% "cd %REMOTE_DIR% && npm install"

echo.
echo ✅ تم الرفع بنجاح!
echo اذهب إلى لوحة alwaysdata وأعد تشغيل الموقع.
pause
