#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p output

# Compile the SmartPy contract
echo "[Compile] Compiling counter.py..."
python3 -m smartpy compile src/counter.py output/

if [ $? -eq 0 ]; then
    echo "[Compile] Compilation successful!"
    echo "[Compile] Output files:"
    ls -la output/counter/
else
    echo "[Compile] Compilation failed!"
    exit 1
fi