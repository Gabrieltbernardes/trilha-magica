@echo off
REM Compila o backend Java (usa apenas o JDK + o driver JDBC do SQLite em lib\).
echo Compilando Trilha Magica (backend Java)...
if not exist build mkdir build
setlocal enabledelayedexpansion
set FILES=
for /r src %%f in (*.java) do set FILES=!FILES! "%%f"
javac -d build -encoding UTF-8 -cp lib\sqlite-jdbc.jar !FILES!
if errorlevel 1 (
  echo Falha ao compilar.
  exit /b 1
)
echo Compilado com sucesso. Use run.bat para iniciar o servidor.
