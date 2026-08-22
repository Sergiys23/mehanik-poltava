#include "media_engine.hpp"
#include <iostream>
#include <sstream>
#include <string>

static void usage(){
    std::cerr <<
      "media-engine commands:\n"
      "  probe <input>\n"
      "  transcode <input> <output.mp4>\n"
      "  thumbnail <input> <output.jpg>\n";
}

int main(int argc,char** argv){
    if(argc<3){ usage(); return 2; }

    const std::string cmd=argv[1];

    if(cmd=="probe"){
        auto r=me::probe(argv[2]);
        if(!r.ok){
            std::cerr << r.error << "\\n";
            return 1;
        }
        std::cout
          << "format=" << r.format << "\\n"
          << "video_codec=" << r.video_codec << "\\n"
          << "width=" << r.width << "\\n"
          << "height=" << r.height << "\\n"
          << "duration=" << r.duration << "\\n";
        return 0;
    }

    if(cmd=="transcode" && argc>=4){
        auto r=me::transcode_h264_faststart(argv[2],argv[3]);
        if(!r.ok){
            std::cerr << r.error << "\\n";
            return 1;
        }
        std::cout << r.output << "\\n";
        return 0;
    }

    if(cmd=="thumbnail" && argc>=4){
        auto r=me::make_thumbnail(argv[2],argv[3]);
        if(!r.ok){
            std::cerr << r.error << "\\n";
            return 1;
        }
        std::cout << r.output << "\\n";
        return 0;
    }

    usage();
    return 2;
}
