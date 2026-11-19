#!/bin/bash
# Double-click to run Short Order locally, then open http://localhost:8080
cd "$(dirname "$0")"
( sleep 1; open "http://localhost:8080" ) &
python3 serve.py 8080
