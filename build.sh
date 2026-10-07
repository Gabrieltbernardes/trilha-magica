#!/bin/sh
# Compila o backend Java (usa apenas o JDK + o driver JDBC do SQLite em lib/).
set -e
echo "Compilando Trilha Mágica (backend Java)..."
mkdir -p build
javac -d build -encoding UTF-8 -cp lib/sqlite-jdbc.jar $(find src -name "*.java")
echo "Compilado com sucesso. Use ./run.sh para iniciar o servidor."
