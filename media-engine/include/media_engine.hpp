#pragma once
#include <string>
#include <vector>

namespace me {

struct ProbeResult {
    bool ok{};
    std::string format;
    std::string video_codec;
    std::string audio_codec;
    int width{};
    int height{};
    double duration{};
    std::string error;
};

struct TranscodeResult {
    bool ok{};
    std::string output;
    std::string error;
};

ProbeResult probe(const std::string& input);
TranscodeResult transcode_h264_faststart(
    const std::string& input,
    const std::string& output
);
TranscodeResult make_thumbnail(
    const std::string& input,
    const std::string& output
);

} // namespace me
