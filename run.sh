#!/bin/sh
# Inicia o servidor. Rode a partir da raiz do projeto (onde ficam as
# pastas public/ e data/), para que os caminhos relativos funcionem.
set -e
if [ ! -d "build/com/trilhamagica" ]; then
  echo "Projeto ainda não compilado. Rodando build.sh..."
  sh build.sh
fi
java -Dfile.encoding=UTF-8 -cp "build:lib/sqlite-jdbc.jar" com.trilhamagica.Main
