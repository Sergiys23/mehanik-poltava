#include "media_engine.hpp"
#include <cstdio>
#include <array>
#include <sstream>

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

ProbeResult probe(const std::string& input) {
    ProbeResult out;
    const std::string cmd =
        std::string(ME_FFPROBE_PATH) +
        " -v error -select_streams v:0 "
        "-show_entries stream=codec_name,width,height "
        "-show_entries format=format_name,duration "
        "-of default=noprint_wrappers=1:nokey=0 " +
        shellQuote(input);

    std::array<char,4096> buf{};
    std::string text;
    FILE* pipe=popen(cmd.c_str(),"r");
    if(!pipe){ out.error="ffprobe не запустився"; return out; }

    while(fgets(buf.data(),buf.size(),pipe)) text += buf.data();
    const int rc=pclose(pipe);

    if(rc!=0){ out.error=text.empty()?"ffprobe помилка":text; return out; }

    out.ok=true;
    std::istringstream ss(text);
    std::string line;
    while(std::getline(ss,line)){
        auto p=line.find('=');
        if(p==std::string::npos) continue;
        auto k=line.substr(0,p);
        auto v=line.substr(p+1);

        if(k=="format_name") out.format=v;
        else if(k=="codec_name") out.video_codec=v;
        else if(k=="width") out.width=std::stoi(v);
        else if(k=="height") out.height=std::stoi(v);
        else if(k=="duration") out.duration=std::stod(v);
    }
    return out;
}

} // namespace me
