#!/bin/bash --posix

# -*-  Coding: UTF-8  -*- #
# -*-  System: Linux  -*- #
# -*-  Usage:   *.*   -*- #

# See Bash Set-Options Reference Below

set +euo pipefail # (0)
set +o xtrace # (6)

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

function aws-access-key-id () {
    printf "%s" "$(aws configure get aws_access_key_id)"
}

function aws-secret-access-key () {
    printf "%s" "$(aws configure get aws_secret_access_key)"
}

function aws-session-token () {
    printf "%s" "$(aws configure get aws_session_token)"
}

function aws-session-expiration () {
    printf "%s" "$(aws configure get aws_expiration)"
}

function aws-default-region () {
    printf "%s" "$(aws configure get region)"
}

function aws-default-output () {
    printf "%s" "$(aws configure get output)"
}

function main () {
    local target="${1:-"${HOME}/.aws-temporary-credentials"}"

    printf "AWS_ACCESS_KEY_ID=%s\n" "$(aws-access-key-id)" > ${target}
    printf "AWS_SECRET_ACCESS_KEY=%s\n" "$(aws-secret-access-key)" >> ${target}
    printf "AWS_SESSION_TOKEN=%s\n" "$(aws-session-token)" >> ${target}
    printf "AWS_SESSION_EXPIRATION=%s\n" "$(aws-session-expiration)" >> ${target}
    printf "AWS_DEFAULT_REGION=%s\n" "$(aws-default-region)" >> ${target}
    printf "AWS_DEFAULT_OUTPUT=%s\n" "$(aws-default-output)" >> ${target}

    chmod 644 "${target}"

    echo "Successfully Established File: file://${target}"
}

main "${@}"

