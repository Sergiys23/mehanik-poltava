FROM ubuntu:24.04 AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential cmake ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build -j"$(nproc)"

FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /src/build/media-engine /usr/local/bin/media-engine

ENTRYPOINT ["/usr/local/bin/media-engine"]
