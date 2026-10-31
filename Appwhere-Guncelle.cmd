@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  set "APPWHERE_NODE=node"
) else (
  set "APPWHERE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
echo Appwhere dunya magaza verileri taraniyor. Bu islem birkac dakika surebilir.
echo Google Play ulkeleri sirayla taranir; sonraki guncelleme kaldigi yerden devam eder.
"%APPWHERE_NODE%" scripts\collect.mjs
if errorlevel 1 (
  echo Tarama tamamlanamadi. Onceki veriler korundu.
) else (
  echo Tarama tamamlandi. Tarayicidaki sayfayi yenileyin.
)
pause
