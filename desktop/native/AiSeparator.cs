using System.IO;
using System.Numerics;
using System.Security.Cryptography;
using System.Text.Json;
using LibVLCSharp.Shared;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using NAudio.Wave;

namespace SonicOrbit.Native;
internal sealed class AiSeparator(string? modelDirectory=null,string? cacheRoot=null)
{
    private readonly string models=modelDirectory??ModelDirectory;
    public static readonly string[] Names=["vocals","drums","bass","other"];
    public static string ModelDirectory=>Path.Combine(AppContext.BaseDirectory,"assets","models");
    public static bool Available=>File.Exists(Path.Combine(ModelDirectory,"spleeter-4stems.onnx"));
    private const int Size=4096,Hop=1024,Frames=64,Bins=1024,Rate=44100;
    private static readonly double[] Window=Enumerable.Range(0,Size).Select(i=>.5-.5*Math.Cos(2*Math.PI*i/Size)).ToArray();
    public async Task<string> Prepare(string file,LibVLC vlc,IProgress<(double,string)> progress,CancellationToken token)
    {
        using var metadata=JsonDocument.Parse(File.ReadAllText(Path.Combine(models,"manifest.json")));
        var modelHash=metadata.RootElement.GetProperty("sha256").GetString();
        var info=new FileInfo(file);var identity=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(info.FullName+"|"+info.Length+"|"+info.LastWriteTimeUtc.Ticks+"|"+modelHash+"|spleeter-native-v1")));
        var directory=Path.Combine(cacheRoot??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SonicOrbit","cache","stems"),identity);
        if(File.Exists(Path.Combine(directory,"complete.json"))&&Names.All(name=>File.Exists(Path.Combine(directory,name+".wav"))))return directory;
        Directory.CreateDirectory(directory);var input=Path.Combine(directory,"source.wav");
        progress.Report((0,"Decoding up to five minutes locally…"));
        await Decode(file,input,vlc,token);
        return await Task.Run(()=>Separate(input,directory,progress,token),token);
    }
    private static async Task Decode(string file,string output,LibVLC vlc,CancellationToken token)
    {
        using var player=new MediaPlayer(vlc);
        using var media=new Media(vlc,new Uri(file));
        media.AddOption(":no-video");media.AddOption(":no-sout-video");media.AddOption(":stop-time=300");
        media.AddOption(":sout=#transcode{acodec=f32l,channels=2,samplerate=44100}:std{access=file,mux=wav,dst='"+output.Replace("\\","/").Replace("'","\\'")+"'}");
        media.AddOption(":sout-keep");
        var done=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        player.EndReached+=(_,_)=>done.TrySetResult();player.EncounteredError+=(_,_)=>done.TrySetException(new IOException("The media could not be decoded for separation."));
        using var cancel=token.Register(()=>done.TrySetCanceled(token));
        try{if(!player.Play(media))throw new IOException("Cannot start local media decoding.");await done.Task.WaitAsync(TimeSpan.FromMinutes(10),token);}
        finally{await Task.Run(()=>player.Stop());}
        if(!File.Exists(output)||new FileInfo(output).Length<100)throw new IOException("No usable audio was decoded.");
    }
    internal string Separate(string input,string directory,IProgress<(double,string)> progress,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        using var reader=new WaveFileReader(input);var provider=reader.ToSampleProvider();
        if(provider.WaveFormat.Channels!=2||provider.WaveFormat.SampleRate!=Rate)throw new InvalidDataException("Unexpected decoded audio format.");
        // Limit all working buffers to the same five-minute preparation preview.
        var audio=new float[Math.Min((int)(reader.TotalTime.TotalSeconds*Rate+1),Rate*300)*2];int count=0,read;
        while(count<audio.Length&&(read=provider.Read(audio,count,audio.Length-count))>0){count+=read;token.ThrowIfCancellationRequested();}
        int samples=count/2;if(samples<4410)throw new InvalidDataException("Audio is too short to separate.");
        reader.Dispose();Array.Resize(ref audio,count);int totalFrames=(samples+Hop-1)/Hop+2;
        var result=Names.Select(_=>new float[(samples+Size)*2]).ToArray();var norm=new float[samples+Size];
        using var options=new SessionOptions{IntraOpNumThreads=Math.Min(4,Environment.ProcessorCount),InterOpNumThreads=1};
        using var session=new InferenceSession(Path.Combine(models,"spleeter-4stems.onnx"),options);
        var inputName=session.InputMetadata.Keys.Single();
        var spectra=new Complex[Frames*2][];var magnitude=new float[Frames*Bins*2];
        for(int block=0;block<totalFrames;block+=Frames){
            token.ThrowIfCancellationRequested();Array.Clear(magnitude);
            for(int frame=0;frame<Frames;frame++)for(int channel=0;channel<2;channel++){
                var spectrum=new Complex[Size];int start=(block+frame)*Hop-Size/2;
                for(int i=0;i<Size;i++){int at=start+i;if(at>=0&&at<samples)spectrum[i]=audio[at*2+channel]*Window[i];}
                Fft(spectrum,false);spectra[frame*2+channel]=spectrum;
                for(int bin=0;bin<Bins;bin++)magnitude[(frame*Bins+bin)*2+channel]=(float)spectrum[bin].Magnitude;
            }
            var tensor=new DenseTensor<float>(magnitude,[1,Frames,Bins,2]);
            using var output=session.Run([NamedOnnxValue.CreateFromTensor(inputName,tensor)]);
            var estimates=output.Select(value=>value.AsTensor<float>().ToArray()).ToArray();
            for(int frame=0;frame<Frames&&block+frame<totalFrames;frame++){
                int start=(block+frame)*Hop-Size/2;
                for(int channel=0;channel<2;channel++){
                    var original=spectra[frame*2+channel];
                    for(int stem=0;stem<4;stem++){
                        var spectrum=new Complex[Size];
                        for(int bin=0;bin<=Size/2;bin++){
                            double mask;
                            if(bin>=Bins)mask=stem==3?1:0; // Preserve the high band in "other"; do not silently discard it.
                            else{int at=(frame*Bins+bin)*2+channel;double sum=1e-12;for(int s=0;s<4;s++)sum+=estimates[s][at]*estimates[s][at];mask=estimates[stem][at]*estimates[stem][at]/sum;}
                            spectrum[bin]=original[bin]*mask;if(bin>0&&bin<Size/2)spectrum[Size-bin]=Complex.Conjugate(spectrum[bin]);
                        }
                        Fft(spectrum,true);
                        for(int i=0;i<Size;i++){int at=start+i;if(at>=0&&at<samples)result[stem][at*2+channel]+=(float)(spectrum[i].Real*Window[i]);}
                    }
                }
                for(int i=0;i<Size;i++){int at=start+i;if(at>=0&&at<samples)norm[at]+=(float)(Window[i]*Window[i]);}
            }
            progress.Report((.05+.9*Math.Min(1,(block+Frames)/(double)totalFrames),"Separating vocals, drums, bass and instruments locally…"));
        }
        for(int stem=0;stem<4;stem++){
            token.ThrowIfCancellationRequested();
            for(int i=0;i<samples;i++)for(int channel=0;channel<2;channel++){int at=i*2+channel;result[stem][at]=norm[i]>1e-8?result[stem][at]/norm[i]:0;if(!float.IsFinite(result[stem][at]))throw new InvalidDataException("AI returned invalid samples.");}
            var temporary=Path.Combine(directory,Names[stem]+".partial.wav");using(var writer=new WaveFileWriter(temporary,WaveFormat.CreateIeeeFloatWaveFormat(Rate,2)))writer.WriteSamples(result[stem],0,samples*2);
            File.Move(temporary,Path.Combine(directory,Names[stem]+".wav"),true);
        }
        File.WriteAllText(Path.Combine(directory,"complete.json"),JsonSerializer.Serialize(new{model="spleeter-4stems",duration=samples/(double)Rate,previewLimit=300}));
        File.Delete(input);progress.Report((1,"AI tracks ready locally. Enable the prepared front stage to listen."));return directory;
    }
    internal static void Fft(Complex[] buffer,bool inverse)
    {
        int n=buffer.Length;for(int i=1,j=0;i<n;i++){int bit=n>>1;for(;(j&bit)!=0;bit>>=1)j^=bit;j^=bit;if(i<j)(buffer[i],buffer[j])=(buffer[j],buffer[i]);}
        for(int length=2;length<=n;length<<=1){double angle=(inverse?2:-2)*Math.PI/length;var step=new Complex(Math.Cos(angle),Math.Sin(angle));for(int start=0;start<n;start+=length){Complex phase=1;for(int j=0;j<length/2;j++){var even=buffer[start+j];var odd=buffer[start+j+length/2]*phase;buffer[start+j]=even+odd;buffer[start+j+length/2]=even-odd;phase*=step;}}}
        if(inverse)for(int i=0;i<n;i++)buffer[i]/=n;
    }
}
