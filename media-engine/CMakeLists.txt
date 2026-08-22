cmake_minimum_required(VERSION 3.20)
project(mehanik_media_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Threads REQUIRED)

add_executable(media-engine
    src/main.cpp
    src/probe.cpp
    src/transcoder.cpp
    src/thumbnail.cpp
)

target_include_directories(media-engine PRIVATE include)
target_link_libraries(media-engine PRIVATE Threads::Threads)

# FFmpeg is invoked as a separate process. This keeps the C++ engine portable
# and avoids coupling the HTTP service to a particular FFmpeg SDK build.
find_program(FFMPEG_EXECUTABLE ffmpeg REQUIRED)
find_program(FFPROBE_EXECUTABLE ffprobe REQUIRED)

target_compile_definitions(media-engine PRIVATE
    ME_FFMPEG_PATH="${FFMPEG_EXECUTABLE}"
    ME_FFPROBE_PATH="${FFPROBE_EXECUTABLE}"
)
