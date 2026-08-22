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

TranscodeResult make_thumbnail(
    const std::string& input,
    const std::string& output
){
    TranscodeResult r;
    const std::string cmd =
        std::string(ME_FFMPEG_PATH) +
        " -hide_banner -loglevel error -y "
        "-ss 00:00:01 -i " + shellQuote(input) +
        " -frames:v 1 -vf scale='min(1280,iw)':-2 "
        "-q:v 3 " + shellQuote(output);

    const int rc=std::system(cmd.c_str());
    r.ok=(rc==0);
    r.output=output;
    if(!r.ok) r.error="Не вдалося створити прев'ю";
    return r;
}

} // namespace me
