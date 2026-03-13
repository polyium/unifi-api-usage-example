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

# The "git working directory" representing the top-level file-system location.
function gwd() {
  git rev-parse --show-toplevel
}

mkdir -p $(gwd)/assets/{certificates,private}
chmod 700 "$(gwd)/assets/private"
touch "$(gwd)/assets/index.txt"
echo 1000 > "$(gwd)/assets/serial"

cat << EOF > "$(gwd)/assets/openssl.cnf"
[ ca ]
default_ca      = ca-default

[ ca-default ]
dir             = ./assets/certificates
database        = \$dir/index.txt
new_certs_dir   = \$dir/newcerts
serial          = \$dir/serial
private_key     = \$dir/private/ca.key.pem
certificate     = \$dir/certificates/ca.crt.internals.pem
default_md      = sha256
policy          = policy-match
x509_extensions = v3_ca

[ policy-match ]
commonName      = supplied

[ req ]
distinguished_name = distinguished-name
x509_extensions    = v3-ca
prompt             = no

[ distinguished-name ]
CN = Acme Corporation Root CA

[ v3-ca ]
basicConstraints = critical, CA:true
keyUsage         = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

openssl genrsa -out "$(gwd)/assets/private/ca.key.pem" 4096
chmod 600 "$(gwd)/assets/private/ca.key.pem"

openssl req -config "$(gwd)/assets/openssl.cnf" -key "$(gwd)/assets/private/ca.key.pem" -new -x509 -days 3650 -sha256 -out "$(gwd)/assets/certificates/ca.crt.internals.pem"

openssl x509 -noout -subject -issuer -fingerprint -sha256 -in "$(gwd)/assets/certificates/ca.crt.internals.pem"
