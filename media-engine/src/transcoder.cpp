#include "media_engine.hpp"
#include <cstdlib>
#include <string>

namespace {
std::string shellQuote(const std::string& s) {
    std::string r="'";
    for(char c:s) {
        if(c=='\'') r += "'\\''";
        else r += c;
    }
    return r + "'";
}
}

namespace me {

TranscodeResult transcode_h264_faststart(
    const std::string& input,
    const std::string& output
){
    TranscodeResult r;

    const std::string cmd =
        std::string(ME_FFMPEG_PATH) +
        " -hide_banner -loglevel error -y "
        "-i " + shellQuote(input) +
        " -map 0:v:0 -map 0:a:0? "
        "-c:v libx264 -preset medium -crf 23 "
        "-pix_fmt yuv420p "
        "-profile:v main -level 4.1 "
        "-c:a aac -b:a 128k "
        "-movflags +faststart " +
        shellQuote(output);

    const int rc=std::system(cmd.c_str());

    r.ok=(rc==0);
    r.output=output;
    if(!r.ok) r.error="FFmpeg не зміг перекодувати відео";
    return r;
}

} // namespace me
