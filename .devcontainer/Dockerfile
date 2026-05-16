FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    curl \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Bazelisk as `bazel`
ARG BAZELISK_VERSION=1.25.0
RUN curl -fsSL \
    "https://github.com/bazelbuild/bazelisk/releases/download/v${BAZELISK_VERSION}/bazelisk-linux-amd64" \
    -o /usr/local/bin/bazel \
    && chmod +x /usr/local/bin/bazel

# rules_python refuses to download its hermetic Python toolchain when running
# as root. Ubuntu 24.04 ships a non-root `ubuntu` user (UID 1000) — use it.
# Grant passwordless sudo so gz_setup can install system packages if needed.
RUN apt-get update && apt-get install -y --no-install-recommends sudo \
    && rm -rf /var/lib/apt/lists/* \
    && echo "ubuntu ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu
