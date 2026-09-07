from scripts.scan_secrets import scan_text


def test_scanner_reports_location_without_exposing_value():
    secret = 'sk-' + ('x' * 24)

    findings = scan_text('fixture.txt', f'API_KEY={secret}')

    assert [(item.path, item.line, item.kind) for item in findings] == [('fixture.txt', 1, 'openai-key')]
    assert all(secret not in repr(item) for item in findings)


def test_scanner_allows_placeholders():
    assert scan_text('fixture.txt', 'API_KEY=<set-in-local-environment>') == []
