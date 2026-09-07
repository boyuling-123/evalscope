#!/usr/bin/env python3
"""Scan tracked text files for common credential shapes without echoing values."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

MAX_FILE_BYTES = 2 * 1024 * 1024
ALLOWED_ENV_FILES = {'.env.example', '.env.local.example'}
SECRET_PATTERNS = (
    ('private-key', re.compile(r'-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----')),
    ('openai-key', re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b')),
    ('aws-access-key', re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b')),
    ('github-token', re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b')),
    ('bearer-token', re.compile(r'\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b', re.IGNORECASE)),
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    kind: str


def tracked_paths(root: Path) -> list[Path]:
    result = subprocess.run(
        ['git', 'ls-files', '-z'],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return [root / item.decode('utf-8') for item in result.stdout.split(b'\0') if item]


def scan_text(path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in SECRET_PATTERNS:
            if pattern.search(line):
                findings.append(Finding(path=path, line=line_number, kind=kind))
    return findings


def scan_paths(root: Path, paths: Iterable[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        relative = path.relative_to(root).as_posix()
        if path.name.startswith('.env') and path.name not in ALLOWED_ENV_FILES:
            findings.append(Finding(path=relative, line=1, kind='tracked-env-file'))
            continue
        try:
            content = path.read_bytes()
        except OSError:
            continue
        if len(content) > MAX_FILE_BYTES or b'\0' in content:
            continue
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            continue
        findings.extend(scan_text(relative, text))
    return findings


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    paths = tracked_paths(root)
    findings = scan_paths(root, paths)
    if findings:
        for finding in findings:
            print(f'Secret scan failed: {finding.kind} in {finding.path}:{finding.line}')
        return 1
    print(f'Secret scan passed ({len(paths)} tracked files checked).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
