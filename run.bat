@echo off
REM Inicia o servidor. Rode a partir da raiz do projeto (onde ficam as
REM pastas public\ e data\), para que os caminhos relativos funcionem.
if not exist build\com\trilhamagica (
  echo Projeto ainda nao compilado. Rodando build.bat...
  call build.bat
)
java -Dfile.encoding=UTF-8 -cp "build;lib\sqlite-jdbc.jar" com.trilhamagica.Main
