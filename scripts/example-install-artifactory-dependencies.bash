#!/usr/bin/env bash

#
# -*-  Coding: UTF-8  -*- #
# -*-  System: Linux  -*- #
# -*-  Usage:   *.*   -*- #
#

# Author: Jacob Sanders (GitHub - Segmentational)

#
# Shellcheck Ignore List
#
# shellcheck disable=SC1073
# shellcheck disable=SC2120
# shellcheck disable=SC2071
# shellcheck disable=SC2086
# shellcheck disable=SC2086
#

#
# Bash Set-Options Reference
#

#
# 1.   set -o verbose     ::: Print shell input upon read.
# 2.   set -o allexport   ::: Export all variable(s) + function(s) to environment.
# 3.   set -o errexit     ::: Exit immediately upon pipeline'd failure.
# 4.   set -o monitor     ::: Output process-separated command(s).
# 5.   set -o privileged  ::: Ignore externals - ensures of pristine run environment.
# 6.   set -o xtrace      ::: Print a trace of simple commands.
# 7.   set -o braceexpand ::: Enable brace expansion. Enabled by default.
# 8.   set -o no-exec     ::: Bash syntax debugging; reads in commands but does not execute them.
# 9.   set -o pipefail    ::: Ensures the pipeline return value is that of the last command to exit.
# 10.  set -o history     ::: Enable the use of history for the given script.
#

set -euo pipefail # (0)
set -o xtrace # (6)

# Establish a virtual environment.
# python3 -m venv "$(git rev-parse --show-toplevel)/.venv"
# source $(git rev-parse --show-toplevel)/.venv/bin/activate

if [[ -z "${VIRTUAL_ENV}" ]]; then
    echo "Invalid Runtime - No Python Virtual Environment Found."
    echo " - Creating Virtual Environment"

    python3 -m venv "$(git rev-parse --show-toplevel)/.venv"

    echo "Please run the following command, and try again"
    echo "    source .venv/bin/activate"

    exit 1
fi

# Ensure private CA bundle is added to virtual environment.

if [[ ! $(pip show certifi) ]]; then
    echo "Installing Required Certificate Package(s) ..."

    pip install certifi
fi

cat "$(git rev-parse --show-toplevel)/assets/certificates/ca.crt.internals.pem" >> "$(python -c "import certifi; print(certifi.where())")"

# Install common packages through private registry.

pip install --upgrade pip --no-cache-dir --force-reinstall \
    --index-url "https://artifactory.company.com/artifactory/api/pypi/pypi/simple"

# Optionally install common packages through private registry (--extra-index-url).

pip install . --no-cache-dir --force-reinstall \
    --extra-index-url "https://artifactory.company.com/artifactory/api/pypi/pypi/simple"
