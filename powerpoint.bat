@echo off
REM ============================================================
REM  ANNUAIRE KPI - PowerPoint des visuels Power BI
REM  ------------------------------------------------------------
REM  Glissez votre fichier selection.json sur cette icone, ou
REM  double-cliquez : le script vous le demandera.
REM
REM  La premiere execution installe le navigateur et ouvre une
REM  fenetre pour vous connecter a Power BI. Les suivantes non :
REM  la session est conservee.
REM ============================================================
setlocal
cd /d "%~dp0"
chcp 65001 >nul

set "SELECTION=%~1"
if "%SELECTION%"=="" (
  echo.
  echo   Glissez ici le fichier selection.json exporte depuis l'annuaire,
  echo   puis appuyez sur Entree.
  echo.
  set /p "SELECTION=  Fichier : "
)
set "SELECTION=%SELECTION:"=%"

if not exist "%SELECTION%" (
  echo.
  echo   [X] Fichier introuvable : %SELECTION%
  echo       Exportez-le depuis l'annuaire : Selection ^& PowerPoint ^> Generer ^> Exporter la selection
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js n'est pas installe sur ce poste.
  echo       Telechargez-le sur https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo.
  echo   [1/3] Installation du navigateur ^(une seule fois, quelques minutes^)...
  call npm run installer:navigateur || goto :erreur
)

if not exist "%USERPROFILE%\.annuaire-kpi-profil" (
  echo.
  echo   [2/3] Connexion a Power BI ^(une seule fois^)...
  echo         Une fenetre s'ouvre : connectez-vous, puis fermez-la.
  call npm run connexion -- "%SELECTION%" || goto :erreur
)

echo.
echo   [3/3] Capture des pages et assemblage du PowerPoint...
call npm run powerpoint -- "%SELECTION%" || goto :erreur

echo.
echo   [OK] Termine.
echo.
pause
exit /b 0

:erreur
echo.
echo   [X] Echec. Le message ci-dessus indique la cause.
echo.
pause
exit /b 1
