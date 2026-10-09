import os
import tempfile
from pathlib import Path

_fd, _path = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + Path(_path).as_posix()
