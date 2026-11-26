#include "spatial.h"
#include <array>
#include <vector>
#include <mutex>
#include <cmath>
#include <algorithm>
#include <new>

namespace {
constexpr int Taps=256;
constexpr float Pi=3.14159265358979323846f;
struct Kernel { std::array<std::array<float,Taps>,4> filter{}; bool spatial=false; float volume=.5f; };
struct Engine {
    std::mutex settingsMutex;
    std::vector<float> angles, impulses;
    int positions=0;
    Kernel pending,current;
    std::array<std::array<float,Taps*2>,2> history{};
    int cursor=0;
    float yaw=0,width=45,anchor=.65f,guard=1;
    void configure(int enabled,float heading,float spread,float centre,float volume) {
        std::lock_guard<std::mutex> lock(settingsMutex);
        yaw=heading; width=std::clamp(spread,10.f,85.f);anchor=std::clamp(centre,0.f,1.f);
        Kernel next;next.spatial=enabled!=0&&positions>0;next.volume=std::clamp(volume,0.f,1.f);
        if(next.spatial){
            int directions[3]={nearest(-width-yaw),nearest(width-yaw),nearest(-yaw)};
            for(int ear=0;ear<2;ear++)for(int tap=0;tap<Taps;tap++){
                float left=impulses[(directions[0]*2+ear)*Taps+tap],right=impulses[(directions[1]*2+ear)*Taps+tap],front=impulses[(directions[2]*2+ear)*Taps+tap];
                next.filter[ear*2][tap]=.75f*((1-anchor*.5f)*left-anchor*.5f*right)+.6f*anchor*front;
                next.filter[ear*2+1][tap]=.75f*((1-anchor*.5f)*right-anchor*.5f*left)+.6f*anchor*front;
            }
        }else{next.filter[0][0]=1;next.filter[3][0]=1;}
        pending=next;
    }
    int nearest(float azimuth) const {
        // Dataset azimuth is positive left; host azimuth is positive right.
        const float target=-azimuth*Pi/180;float best=-100;int found=0;
        for(int i=0;i<positions;i++){
            const float az=angles[i*2]*Pi/180,el=angles[i*2+1]*Pi/180;
            const float dot=std::cos(el)*std::cos(az-target);
            if(dot>best){best=dot;found=i;}
        }return found;
    }
};
bool finite(float value){return std::isfinite(value);}
}
void* so_create(){try{auto* engine=new Engine;engine->configure(0,0,45,.65f,.5f);engine->current=engine->pending;return engine;}catch(...){return nullptr;}}
void so_destroy(void* handle){delete static_cast<Engine*>(handle);}
int so_load_hrtf(void* handle,const float* angles,const float* impulses,int positions,int taps){
    if(!handle||!angles||!impulses||positions<1||positions>4096||taps!=Taps)return 0;
    for(int i=0;i<positions*2;i++)if(!finite(angles[i]))return 0;
    for(int i=0;i<positions*2*taps;i++)if(!finite(impulses[i]))return 0;
    try{auto& e=*static_cast<Engine*>(handle);std::lock_guard<std::mutex> lock(e.settingsMutex);e.angles.assign(angles,angles+positions*2);e.impulses.assign(impulses,impulses+positions*2*taps);e.positions=positions;return 1;}catch(...){return 0;}
}
void so_configure(void* handle,int spatial,float yaw,float width,float anchor,float volume){
    if(!handle||!finite(yaw)||!finite(width)||!finite(anchor)||!finite(volume))return;
    try{static_cast<Engine*>(handle)->configure(spatial,yaw,width,anchor,volume);}catch(...){}
}
void so_reset(void* handle){if(!handle)return;auto& e=*static_cast<Engine*>(handle);for(auto& channel:e.history)channel.fill(0);e.cursor=0;e.guard=1;}
void so_process(void* handle,float* samples,int frames){
    if(!handle||!samples||frames<1||frames>480000)return;
    auto& e=*static_cast<Engine*>(handle);Kernel target=e.current;
    if(e.settingsMutex.try_lock()){target=e.pending;e.settingsMutex.unlock();}
    // Interpolate kernels and gain across the block. No allocation or waiting on the audio thread.
    for(int frame=0;frame<frames;frame++){
        for(int channel=0;channel<2;channel++){const float input=samples[frame*2+channel];e.history[channel][e.cursor]=e.history[channel][e.cursor+Taps]=finite(input)?input:0;}
        const float blend=float(frame+1)/frames;float out[2]={0,0};
        for(int ear=0;ear<2;ear++)for(int channel=0;channel<2;channel++){
            const auto& start=e.current.filter[ear*2+channel];const auto& end=target.filter[ear*2+channel];
            const float* history=e.history[channel].data()+e.cursor+Taps;
            float sum=0;for(int tap=0;tap<Taps;tap++)sum+=history[-tap]*(start[tap]+blend*(end[tap]-start[tap]));out[ear]+=sum;
        }
        const float gain=.5f*(e.current.volume+blend*(target.volume-e.current.volume));out[0]*=gain;out[1]*=gain;
        const float peak=std::max(std::abs(out[0]),std::abs(out[1]));const float safe=peak>.94f?.94f/peak:1.f;
        if(safe<e.guard)e.guard=safe;else e.guard+=(safe-e.guard)*.0002f;
        for(int ear=0;ear<2;ear++)samples[frame*2+ear]=finite(out[ear])?std::clamp(out[ear]*e.guard,-.94f,.94f):0;
        if(++e.cursor==Taps)e.cursor=0;
    }e.current=target;
}
