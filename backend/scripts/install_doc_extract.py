"""Install document extraction dependencies into the active Python environment."""

from __future__ import annotations

import subprocess
import sys

PACKAGES = [
    "pymupdf>=1.24.0",
    "python-pptx>=1.0.0",
    "python-docx>=1.1.0",
    "rapidocr-onnxruntime>=1.3.0",
    "opencv-python-headless>=4.10.0",
    "Pillow>=10.0.0",
    "python-multipart>=0.0.9",
]


def main() -> int:
    cmd = [sys.executable, "-m", "pip", "install", *PACKAGES]
    print("Installing document extraction packages...")
    print(" ", " ".join(cmd))
    subprocess.check_call(cmd)
    print("Done. OCR models download on first use into user cache.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
