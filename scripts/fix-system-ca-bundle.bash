#!/bin/bash --posix

# -*-  Coding: UTF-8  -*- #
# -*-  System: Linux  -*- #
# -*-  Usage:   *.*   -*- #

# Author: Jacob Sanders (GitHub - Segmentational)

# See Bash Set-Options Reference Below

set -euo pipefail # (0)
set -o xtrace # (6)

# --------------------------------------------------------------------------------
# Bash Set-Options Reference
#     - https://tldp.org/LDP/abs/html/options.html
# --------------------------------------------------------------------------------

# 0. An Opinionated, Well Agreed Upon Standard for Bash Script Execution
# 1. set -o verbose     ::: Print Shell Input upon Read
# 2. set -o allexport   ::: Export all Variable(s) + Function(s) to Environment
# 3. set -o errexit     ::: Exit Immediately upon Pipeline'd Failure
# 4. set -o monitor     ::: Output Process-Separated Command(s)
# 5. set -o privileged  ::: Ignore Externals - Ensures of Pristine Run Environment
# 6. set -o xtrace      ::: Print a Trace of Simple Commands
# 7. set -o braceexpand ::: Enable Brace Expansion
# 8. set -o no-exec     ::: Bash Syntax Debugging

function cwd() {
    printf "%s" "$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
}

function assets() {
    printf "%s" "$(cwd)/../assets"
}

function main() {
    if [[ ! $(pip show certifi) ]]; then
        echo "Installing Required Certificate Package(s) ..."

        python3 -m pip install certifi
    fi

    cat "$(assets)/certificates/ca.crt.internals.pem" >> "$(python -c "import certifi; print(certifi.where())")"
}

main
