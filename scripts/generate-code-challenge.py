#!/usr/bin/env python

import re
import secrets
import hashlib
import base64
import shlex
import subprocess
import os
import shutil
import sys
import logging
import pathlib

from typing import Union, Any, Optional

handler = logging.StreamHandler()

class Formatter(logging.Formatter):
    expression = r"(?<!\w)'([^\s']+)'(?!\w)"
    substitution = r'"\1"'

    def format(self, record) -> str:
        # Modify the record or format the message as needed.
        v = super().format(record)  # .replace("'", "%s" % '"')

        return re.sub(self.expression, self.substitution, v)

formatter = Formatter("[%(levelname)s] (%(name)s) %(message)s")

handler.setFormatter(formatter)

logging.basicConfig(level=logging.DEBUG)

logger: logging.Logger = logging.getLogger(__name__ if __name__ != "__main__" else pathlib.Path(__file__).name)
logger.addHandler(handler)
logger.propagate = False

bits: int = 128

def main():
    verifier: str = secrets.token_urlsafe(bits)

    sha256: bytes = hashlib.sha256(verifier.encode("ascii")).digest()

    encoded: str = base64.urlsafe_b64encode(sha256).rstrip(b"=").decode("ascii")

    if sys.stdout.isatty():
        executable: Optional[Union[os.PathLike, pathlib.PosixPath]] = shutil.which("pbcopy")

        if executable is not None:
            raw = shlex.join([executable, encoded])
            args = shlex.split(raw)

            run = subprocess.Popen(args, shell=False, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            run.stdin.writelines([encoded.encode("ascii")])
            run.stdin.close()

            returncode = run.wait(timeout = 10)
            if returncode != 0:
                logger.error("Failed to copy to clipboard. Error: %s", run.stderr.read().decode("utf-8"))
                exit(1)

            sys.stdout.write("A cryptographically secure token has been successfully created for a PKCE code-challenge." + "\n" * 2 + "Contents have been copied to clipboard." + "\n")
        else:
            sys.stdout.write(encoded + "\n")
    else:
        sys.stdout.write(encoded + "\n")

    exit(0)

if __name__ == "__main__":
    main()