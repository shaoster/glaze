import ast
import pathlib


# Modal enforces this server-side; values below this are rejected at deploy time.
MODAL_DISK_MIN_MIB = 524288


def test_no_invalid_ephemeral_disk_values():
    src = (pathlib.Path(__file__).parent.parent / "glaze_compute_service.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg == "ephemeral_disk" and isinstance(kw.value, ast.Constant):
                    assert kw.value.value >= MODAL_DISK_MIN_MIB, (
                        f"ephemeral_disk={kw.value.value} MiB is below Modal's "
                        f"minimum of {MODAL_DISK_MIN_MIB} MiB (512 GiB). "
                        f"Remove the parameter or raise it to at least {MODAL_DISK_MIN_MIB}."
                    )
