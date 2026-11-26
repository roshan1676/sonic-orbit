using System.IO;
using NAudio.Wave;

namespace SonicOrbit.Native;
internal sealed class StemStage : IDisposable
{
    private readonly float[][] tracks=new float[4][];
    private readonly NativeRenderer[] renderers=Enumerable.Range(0,4).Select(_=>new NativeRenderer()).ToArray();
    private readonly float[] angles=[0,35,-10,-40];
    private readonly byte[] scratch=new byte[48000*8];
    private readonly float[] sum=new float[48000*2];
    private string loadedProfile="H3";
    public double Duration {get;}
    public StemStage(string directory)
    {
        try{
            for(int stem=0;stem<4;stem++){
                using var reader=new WaveFileReader(Path.Combine(directory,AiSeparator.Names[stem]+".wav"));
                if(reader.WaveFormat.SampleRate!=44100||reader.WaveFormat.Channels!=2)throw new InvalidDataException("Invalid prepared track format.");
                var provider=reader.ToSampleProvider();int frames=(int)Math.Ceiling(reader.TotalTime.TotalSeconds*44100);tracks[stem]=new float[frames];var chunk=new float[8192];int at=0,n;
                while((n=provider.Read(chunk,0,chunk.Length))>0)for(int i=0;i+1<n&&at<frames;i+=2)tracks[stem][at++]=(chunk[i]+chunk[i+1])*.5f;
            }Duration=tracks.Min(track=>track.Length)/44100.0;
        }catch{Dispose();throw;}
    }
    public void Configure(string profile,float yaw,float volume)
    {
        for(int stem=0;stem<4;stem++){if(profile!=loadedProfile)renderers[stem].LoadProfile(profile);renderers[stem].Configure(true,yaw-angles[stem],45,volume,1);}loadedProfile=profile;
    }
    public bool Render(byte[] destination,int offset,int count,double mediaSeconds)
    {
        int frames=count/8;if(frames>48000||mediaSeconds>=Duration)return false;Array.Clear(sum,0,frames*2);
        for(int stem=0;stem<4;stem++){
            var samples=System.Runtime.InteropServices.MemoryMarshal.Cast<byte,float>(scratch.AsSpan(0,count));var track=tracks[stem];
            for(int frame=0;frame<frames;frame++){
                double at=(mediaSeconds+frame/48000.0)*44100;int index=(int)Math.Floor(at);double fraction=at-index;
                float value=index>=0&&index+1<track.Length?(float)(track[index]*(1-fraction)+track[index+1]*fraction):0;
                samples[frame*2]=samples[frame*2+1]=value;
            }
            renderers[stem].Process(scratch,0,count);
            for(int i=0;i<frames*2;i++)sum[i]+=samples[i];
        }
        var output=System.Runtime.InteropServices.MemoryMarshal.Cast<byte,float>(destination.AsSpan(offset,count));
        for(int frame=0;frame<frames;frame++){
            float peak=Math.Max(Math.Abs(sum[frame*2]),Math.Abs(sum[frame*2+1]));float gain=peak>.94f?.94f/peak:1;
            output[frame*2]=sum[frame*2]*gain;output[frame*2+1]=sum[frame*2+1]*gain;
        }return true;
    }
    public void Reset(){foreach(var renderer in renderers)renderer.Reset();}
    public void Dispose(){foreach(var renderer in renderers)renderer.Dispose();}
}
