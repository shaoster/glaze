from pathlib import Path


def _backup_script_text() -> str:
    template_path = (
        Path(__file__).resolve().parents[1]
        / "chart"
        / "glaze"
        / "templates"
        / "configmap-backup.yaml"
    )
    lines = template_path.read_text().splitlines()

    script_lines: list[str] = []
    in_script = False
    for line in lines:
        if line == "  backup.sh: |":
            in_script = True
            continue
        if not in_script:
            continue
        if line.startswith("    "):
            script_lines.append(line[4:])
            continue
        if line.strip() == "":
            script_lines.append("")
            continue
        break

    return "\n".join(script_lines)


def test_backup_script_authenticates_pg_dump():
    script = _backup_script_text()

    assert 'PGPASSWORD="$POSTGRES_PASSWORD" "$PG_DUMP"' in script


def test_backup_script_keeps_restore_state_alive_for_trap():
    script = _backup_script_text()

    assert script.count("local_started=0") == 2
    assert script.index("local_started=0") < script.index("main() {")
