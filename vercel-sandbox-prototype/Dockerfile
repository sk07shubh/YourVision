FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH=${JAVA_HOME}/bin:${PATH}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        coreutils \
        openjdk-21-jdk-headless \
        procps \
        sudo \
    && java --list-modules | grep -q '^jdk.jdi@' \
    && javac -version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /vercel/sandbox
