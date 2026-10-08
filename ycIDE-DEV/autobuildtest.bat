@echo off
rem ============================================================
rem  ycIDE AutoBuild - one-click batch compile test
rem
rem  Fixed-target convenience wrapper around the AutoBuild CLI:
rem  it always points at the "autobuildtest" folder sitting next
rem  to this file, so you can just double-click and watch it run.
rem
rem  Usage:
rem    autobuildtest.bat                 compile + run every project
rem    autobuildtest.bat --list          only list the projects found
rem    autobuildtest.bat --run-timeout 3000
rem    autobuildtest.bat --watchdog 2    force-exit after 2 minutes
rem    autobuildtest.bat <folder> ...    use another folder instead
rem
rem  What it does:
rem    1. cd to this file's folder (the ycIDE-DEV root)
rem    2. make sure node_modules exists and out\main\cli.js is up to date
rem    3. run:  node out\main\cli.js build <target> --log <file> [flags]
rem       (flags default to --run)
rem    4. print the exit code and pause so the window stays open
rem
rem  Notes:
rem    - GUI projects (OutputType=WindowsApp) are auto-closed after
rem      15s by default; use --run-timeout <ms> to change that.
rem      Console projects have no timeout (they run to completion).
rem    - DynamicLibrary (.dll) projects are compiled, but their run
rem      step is skipped automatically - a DLL cannot be launched.
rem    - The autobuild watchdog force-exits after 10 minutes by
rem      default (exit code 124); use --watchdog <minutes> to change.
rem    - Messages in THIS file are ASCII-only on purpose (cmd.exe
rem      parses .bat with the local OEM code page; UTF-8 Chinese
rem      here would be garbled). The tool's own Chinese output comes
rem      from node, not from this file, and displays fine. If it
rem      ever looks garbled, run "chcp 65001" in the console first.
rem    - A full transcript is also written to the log file printed
rem      at the end, handy for reviewing what happened afterwards.
rem ============================================================
setlocal
title ycIDE AutoBuild Test
cd /d "%~dp0"

rem ---- target: default is .\autobuildtest; a first arg that is an
rem ---- existing folder overrides it (so this file stays reusable)
set "PROJECT=%~dp0autobuildtest"
if "%~1"=="" goto target_ready
if not exist "%~1\" goto target_ready
set "PROJECT=%~1"
shift

:target_ready
rem A trailing backslash would break the quoting below.
rem (goto-guarded: %VAR:~0,-1% misbehaves when VAR is empty - see autobuild.bat)
if not "%PROJECT:~-1%"=="\" goto no_trailing_slash
set "PROJECT=%PROJECT:~0,-1%"
:no_trailing_slash

rem ---- all remaining args become CLI flags ----
set "EXTRA="
:collect
if "%~1"=="" goto collected
set "EXTRA=%EXTRA% %~1"
shift
goto collect

:collected
rem Default to compile + auto-run when the user passed no flags.
if not defined EXTRA set "EXTRA=--run"

set "LOGFILE=%~dp0debug_logs\autobuildtest.log"

echo ============================================================
echo  ycIDE AutoBuild - autobuildtest batch run
echo ============================================================
echo  Target  : %PROJECT%
echo  Options : %EXTRA%
echo  Log     : %LOGFILE%
echo.

rem Trailing backslash makes "exist" test for a directory specifically.
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
echo [1/2] Building ycIDE CLI ^(electron-vite build - first run / after source edits^)...
call npm run build
if errorlevel 1 goto build_failed

:cli_ready
echo [2/2] Running AutoBuild...
echo  ^> node "out\main\cli.js" build "%PROJECT%" --log "%LOGFILE%" %EXTRA%
echo.
node "out\main\cli.js" build "%PROJECT%" --log "%LOGFILE%" %EXTRA%
set "CODE=%errorlevel%"
echo.
echo ------------------------------------------------------------
echo  AutoBuild finished. Exit code %CODE%
echo    0 = all ok   1 = some failed   2 = usage error   124 = watchdog timeout
echo  Full log: %LOGFILE%
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
