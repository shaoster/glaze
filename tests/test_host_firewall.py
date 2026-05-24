"""Regression tests for production host firewall convergence."""

from __future__ import annotations

from pathlib import Path


def _ensure_cluster_script() -> str:
    return (
        Path(__file__).resolve().parents[1] / "tools" / "ensure_cluster.sh"
    ).read_text()


def test_ensure_cluster_converges_host_firewall():
    script = _ensure_cluster_script()

    assert "glaze_host_firewall" in script
    assert "glaze-host-firewall.service" in script
    assert "glaze-host-firewall-apply" in script
    assert "nft delete table inet glaze_host_firewall" in script
    assert "systemctl enable glaze-host-firewall.service" in script
    assert "systemctl restart glaze-host-firewall.service" in script


def test_host_firewall_keeps_public_surface_intentional():
    script = _ensure_cluster_script()

    assert 'iif "tailscale0" accept' in script
    assert 'iifname { "cni0", "flannel.1" } accept' in script
    assert "tcp dport { 80, 443 } accept" in script
    assert "udp dport 41641 accept" not in script
    assert "counter drop" in script


def test_host_firewall_documents_sensitive_ports():
    script = _ensure_cluster_script()

    assert "public kube API" in script
    assert "kubelet" in script
    assert "incidental NodePorts" in script
