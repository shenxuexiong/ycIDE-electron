@echo off
rem ============================================================
rem  ycIDE AutoBuild - batch compile / CI for a whole folder
rem
rem  Drag ANY folder onto this file, or double-click and type
rem  the path. The folder may be:
rem    - one project (contains a .epp)
rem    - a folder holding several projects
rem    - a root folder with nested sub-projects
rem  Every .epp found (recursively, depth 8) is compiled in turn,
rem  then run if --run is given. Errors are printed live.
rem
rem  Examples:
rem    autobuild.bat "D:\ycIDE Projects\All"            -> compile + run all
rem    autobuild.bat "D:\ycIDE Projects\All" --list     -> just list projects
rem    autobuild.bat "D:\ycIDE Projects\All" --run-timeout 5000
rem    autobuild.bat "D:\ycIDE Projects\All" --fail-fast --json
rem
rem  NOTE: messages are ASCII-only on purpose (cmd.exe parses .bat
rem  with the local OEM code page; UTF-8 Chinese would be garbled).
rem  The tool itself prints Chinese output - that is fine, it comes
rem  from node, not from this file.
rem ============================================================
setlocal
title ycIDE AutoBuild
cd /d "%~dp0"

set "PROJECT=%~1"
rem A dragged folder arrives with a trailing backslash, which breaks quoting.
rem NOTE: the strip below is goto-guarded on purpose. cmd expands
rem       %VAR:~0,-1% even when VAR is empty, and in that case it yields
rem       the literal text "~0,-1" - or aborts the script with a
rem       "command syntax is incorrect" error. An empty PROJECT is
rem       exactly what happens when the user types nothing at the prompt.
if not "%PROJECT:~-1%"=="\" goto no_trailing_slash
set "PROJECT=%PROJECT:~0,-1%"
:no_trailing_slash

if defined PROJECT goto have_project

echo ============================================================
echo  ycIDE AutoBuild
echo ============================================================
echo  Compiles EVERY ycIDE project found under a folder.
echo  Drag a folder onto this .bat, or type its path below.
echo.
set /p "PROJECT=Folder path: "
if not defined PROJECT goto no_project

:have_project
rem Remaining args become CLI flags; default to compile + auto-run.
set "EXTRA="
:collect
shift
if "%~1"=="" goto collected
set "EXTRA=%EXTRA% %~1"
goto collect

:collected
if not defined EXTRA set "EXTRA=--run"

echo.
echo Folder  : %PROJECT%
echo Options : %EXTRA%
echo.

rem Trailing backslash makes "exist" test the directory specifically.
if not exist "%PROJECT%\" goto bad_project
if not exist "node_modules" goto need_deps

rem ---- make sure the CLI bundle exists and is newer than the sources ----
if not exist "out\main\cli.js" goto need_build
set "CLI_TS="
for %%f in ("out\main\cli.js") do set "CLI_TS=%%~tf"
set "NEWEST_SRC="
for /f "delims=" %%i in ('dir /b /a-d /o-d "src\main\*.ts" 2^>nul') do if not defined NEWEST_SRC set "NEWEST_SRC=%%i"
if not defined NEWEST_SRC goto need_build
set "SRC_TS="
for %%f in ("src\main\%NEWEST_SRC%") do set "SRC_TS=%%~tf"
if "%SRC_TS%" GTR "%CLI_TS%" goto need_build
goto cli_ready

:need_build
echo [1/2] Building ycIDE CLI ^(first run / after source edits^)...
call npm run build
if errorlevel 1 goto build_failed

:cli_ready
echo [2/2] Running AutoBuild...
echo.
node "out\main\cli.js" build "%PROJECT%" %EXTRA%
set "CODE=%errorlevel%"
echo.
echo ------------------------------------------------------------
echo  AutoBuild finished. Exit code %CODE%  ^(0=all ok  1=some failed  2=usage^)
echo ------------------------------------------------------------
pause
exit /b %CODE%

:bad_project
echo [ERROR] Not an existing folder: %PROJECT%
echo.
pause
exit /b 2

:need_deps
echo [ERROR] node_modules not found. Run run.bat once to install dependencies.
echo.
pause
exit /b 1

:build_failed
echo.
echo [ERROR] Build failed. See the messages above.
echo.
pause
exit /b 1

:no_project
echo [ERROR] No folder path given.
echo.
pause
exit /b 2
