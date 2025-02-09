#!/bin/bash
set -ex

deactivate || true
rm -rf jupyter venv
python -m venv venv
[ -f "venv/bin/activate" ] && source venv/bin/activate || source venv/Scripts/activate
pip install -r jupyter.requirements.txt
jupyter lite build --content notebooks --output-dir jupyter
deactivate