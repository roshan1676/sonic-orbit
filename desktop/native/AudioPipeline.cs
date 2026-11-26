using System.Buffers;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using LibVLCSharp.Shared;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace SonicOrbit.Native;
internal sealed class AudioPipeline(Func<long> clock) : IWaveProvider, IDisposable
{
    private sealed class Chunk(byte[] data,int length,long pts,double mediaTime) { public byte[] Data=data;public int Length=length,Offset;public long Pts=pts;public double MediaTime=mediaTime; }
    private readonly ConcurrentQueue<Chunk> queue=new();
    private readonly object gate=new();
    private WasapiOut? output;
    private bool paused=true,disposed;
    private long queuedBytes;
    private Func<double>? mediaTime;
    private double nextMediaTime=-1;
    private readonly object stageGate=new();
    private StemStage? stage;
    public bool SceneEnabled {get;set;}
    public void SetStage(StemStage? next){lock(stageGate){stage?.Dispose();stage=next;}}
    public void ConfigureStage(string profile,float yaw,float volume){lock(stageGate)stage?.Configure(profile,yaw,volume);}
    public NativeRenderer Renderer {get;}=new();
    public WaveFormat WaveFormat {get;}=WaveFormat.CreateIeeeFloatWaveFormat(48000,2);
    public event Action<string>? DeviceError;
    public long DroppedFrames {get;private set;}
    public long ReceivedBytes {get;private set;}
    public float MaximumPeak {get;private set;}
    public float MaximumInputPeak {get;private set;}
    public long InvalidInputSamples {get;private set;}
    public int LipSyncMs {get;set;}
    public void SelectDevice(MMDevice? device)
    {
        output?.Stop();output?.Dispose();output=null;
        output=device==null?new WasapiOut(AudioClientShareMode.Shared,true,40):new WasapiOut(device,AudioClientShareMode.Shared,true,40);
        output.PlaybackStopped+=(_,e)=>{if(e.Exception!=null&&!disposed)DeviceError?.Invoke("Audio device changed or became unavailable. Choose an output to reconnect. "+e.Exception.Message);};
        output.Init(this);output.Play();Flush();
    }
    public void Attach(MediaPlayer player)
    {
        mediaTime=()=>Math.Max(0,player.Time/1000.0);
        // LibVLC 3 amem supplies S16N even when its fixed-format string says FL32.
        // Request the supported format explicitly and convert only the valid buffer.
        player.SetAudioFormat("S16N",48000,2);
        player.SetAudioCallbacks(Play,(_,_)=>{paused=true;Flush();},(_,_)=>paused=false,(_,_)=>Flush(),_=>{});
    }
    private void Play(IntPtr opaque,IntPtr samples,uint frames,long pts)
    {
        if(disposed||frames==0||frames>480000)return;
        var length=checked((int)frames*8);var data=ArrayPool<byte>.Shared.Rent(length);
        var pcm=ArrayPool<short>.Shared.Rent((int)frames*2);
        try{Marshal.Copy(samples,pcm,0,(int)frames*2);var floating=System.Runtime.InteropServices.MemoryMarshal.Cast<byte,float>(data.AsSpan(0,length));for(int i=0;i<(int)frames*2;i++)floating[i]=pcm[i]/32768f;}
        finally{ArrayPool<short>.Shared.Return(pcm);}
        ReceivedBytes+=length;
        var decoded=System.Runtime.InteropServices.MemoryMarshal.Cast<byte,float>(data.AsSpan(0,length));
        foreach(float sample in decoded){if(float.IsFinite(sample))MaximumInputPeak=Math.Max(MaximumInputPeak,Math.Abs(sample));else InvalidInputSamples++;}
        lock(gate){if(disposed||queuedBytes+length>48000*8*2){ArrayPool<byte>.Shared.Return(data);DroppedFrames+=frames;return;}
            double start=nextMediaTime>=0?nextMediaTime:(mediaTime?.Invoke()??0)+(pts-clock())/1000000.0;
            nextMediaTime=start+frames/48000.0;queue.Enqueue(new(data,length,pts,start));queuedBytes+=length;paused=false;}
    }
    public int Read(byte[] buffer,int offset,int count)
    {
        Array.Clear(buffer,offset,count);var written=0;double timeline=double.NaN;
        lock(gate){
            if(!paused&&!disposed)while(written+8<=count&&queue.TryPeek(out var chunk)){
                long target=clock()+(40L+LipSyncMs)*1000+written/8*1000000L/48000;
                long remaining=chunk.Pts+chunk.Offset/8*1000000L/48000-target;
                if(remaining>1000){int silence=(int)Math.Min((count-written)/8,remaining*48000/1000000);if(silence<1)break;written+=silence*8;continue;}
                if(remaining < -80000){int skip=(int)Math.Min((chunk.Length-chunk.Offset)/8,-remaining*48000/1000000);chunk.Offset+=skip*8;queuedBytes-=skip*8;DroppedFrames+=skip;}
                int copy=Math.Min(count-written,chunk.Length-chunk.Offset);copy-=copy%8;
                if(copy>0){if(double.IsNaN(timeline))timeline=chunk.MediaTime+chunk.Offset/8/48000.0-written/8/48000.0;Buffer.BlockCopy(chunk.Data,chunk.Offset,buffer,offset+written,copy);chunk.Offset+=copy;queuedBytes-=copy;written+=copy;}
                if(chunk.Offset>=chunk.Length){queue.TryDequeue(out _);ArrayPool<byte>.Shared.Return(chunk.Data);}else if(copy==0)break;
            }
        }
        bool rendered=false;if(SceneEnabled&&!double.IsNaN(timeline))lock(stageGate)rendered=stage?.Render(buffer,offset,count-count%8,timeline)??false;
        if(!rendered)Renderer.Process(buffer,offset,count-count%8);
        var outputSamples=System.Runtime.InteropServices.MemoryMarshal.Cast<byte,float>(buffer.AsSpan(offset,count-count%4));
        foreach(float sample in outputSamples)MaximumPeak=Math.Max(MaximumPeak,Math.Abs(sample));
        return count;
    }
    public void Flush(){lock(gate){while(queue.TryDequeue(out var chunk))ArrayPool<byte>.Shared.Return(chunk.Data);queuedBytes=0;nextMediaTime=-1;}Renderer.Reset();lock(stageGate)stage?.Reset();}
    public void Dispose(){disposed=true;output?.Stop();output?.Dispose();Flush();SetStage(null);Renderer.Dispose();}
}
