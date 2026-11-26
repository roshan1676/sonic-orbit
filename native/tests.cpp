#include "spatial.h"
#include <vector>
#include <cmath>
#include <cstdio>
#include <limits>
#include <stdexcept>
#include <chrono>

static void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
int main(){
 try{
    void* engine=so_create();require(engine!=nullptr,"engine allocation");
    std::vector<float> input(2048);for(int i=0;i<1024;i++){input[i*2]=.2f;input[i*2+1]=-.1f;}
    so_configure(engine,0,0,45,.65f,1);so_process(engine,input.data(),1024);
    require(std::abs(input[2046]-.1f)<1e-5f&&std::abs(input[2047]+.05f)<1e-5f,"original stereo and headroom");
    float angles[]={0,0,90,0,180,0,270,0};std::vector<float> impulses(4*2*256);
    for(int position=0;position<4;position++){impulses[(position*2)*256]=position==1?1.f:.3f;impulses[(position*2+1)*256]=position==3?1.f:.3f;}
    require(so_load_hrtf(engine,angles,impulses.data(),4,256)==1,"profile load");
    require(so_load_hrtf(engine,angles,impulses.data(),4,255)==0,"invalid taps rejected");
    so_configure(engine,1,90,45,1,1);std::fill(input.begin(),input.end(),.1f);so_process(engine,input.data(),1024);
    require(input[2046]>input[2047]*1.5f,"right head turn puts front toward left ear");
    so_configure(engine,0,0,45,0,1);std::fill(input.begin(),input.end(),100.f);input[3]=std::numeric_limits<float>::quiet_NaN();so_process(engine,input.data(),1024);
    for(float sample:input)require(std::isfinite(sample)&&std::abs(sample)<=.94001f,"finite bounded output");
    so_reset(engine);so_destroy(engine);
    std::puts("Native DSP: original channels, profile validation, head rotation and linked peak guard passed.");return 0;
 }catch(const std::exception& error){std::fprintf(stderr,"FAIL: %s\n",error.what());return 1;}
}
