using System.Numerics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using SonicOrbit.Native;
using NAudio.Wave;
using LibVLCSharp.Shared;

static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
var workspace=Path.GetFullPath(args.FirstOrDefault()??".");
var results=new List<object>();
using(var renderer=new NativeRenderer()){
    var block=new byte[3840*8];var noise=new Random(1701);var floats=new float[3840*2];
    var rendering=System.Diagnostics.Stopwatch.StartNew();
    for(int iteration=0;iteration<50;iteration++){
        renderer.Configure(true,iteration*7-175,45,.4f);for(int i=0;i<floats.Length;i++)floats[i]=(float)(noise.NextDouble()-.5)*.1f;Buffer.BlockCopy(floats,0,block,0,block.Length);
        renderer.Process(block,0,block.Length);Buffer.BlockCopy(block,0,floats,0,block.Length);Require(floats.All(value=>float.IsFinite(value)&&Math.Abs(value)<=.94001f),"Native renderer produced invalid output");
        if(iteration==25){renderer.LoadProfile("H17");GC.Collect();}
    }results.Add(new{test="Native P/Invoke real-profile processing and profile switch",audioSeconds=4,processingSeconds=rendering.Elapsed.TotalSeconds});
}
var random=new Random(1701);var signal=Enumerable.Range(0,4096).Select(_=>new Complex(random.NextDouble()-.5,random.NextDouble()-.5)).ToArray();
var original=(Complex[])signal.Clone();AiSeparator.Fft(signal,false);AiSeparator.Fft(signal,true);
var fftError=signal.Select((sample,i)=>(sample-original[i]).Magnitude).Max();Require(fftError<1e-10,"FFT round trip error");results.Add(new{test="FFT round trip",maxError=fftError});
var poses=new List<double>();using(var receiver=new OrientationReceiver(yaw=>{lock(poses)poses.Add(yaw);},0)){
    var receiving=receiver.Run();using var sender=new UdpClient();var packet=new byte[48];BitConverter.GetBytes(370.0).CopyTo(packet,24);
    await sender.SendAsync(packet,new IPEndPoint(IPAddress.Loopback,receiver.Port));await Task.Delay(80);
    lock(poses)Require(poses.Count==1&&Math.Abs(poses[0]-10)<1e-6,"OpenTrack yaw wrap failed");
    receiver.Recenter();await sender.SendAsync(packet,new IPEndPoint(IPAddress.Loopback,receiver.Port));await Task.Delay(80);
    lock(poses)Require(poses.Count==2&&Math.Abs(poses[1])<1e-6,"OpenTrack recenter failed");
    BitConverter.GetBytes(double.NaN).CopyTo(packet,24);await sender.SendAsync(packet,new IPEndPoint(IPAddress.Loopback,receiver.Port));await Task.Delay(80);
    lock(poses)Require(poses.Count==2,"Invalid pose accepted");receiver.Dispose();await receiving;
}results.Add(new{test="OpenTrack loopback wrap/recenter/invalid packets",passed=true});
var testRoot=Path.Combine(workspace,".cache","native-tests",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(testRoot);
var input=Path.Combine(testRoot,"input.wav");int frames=44100*2;var samples=new float[frames*2];
for(int i=0;i<frames;i++){samples[i*2]=(float)(.04*Math.Sin(2*Math.PI*440*i/44100));samples[i*2+1]=(float)(.04*Math.Sin(2*Math.PI*660*i/44100));}
using(var writer=new WaveFileWriter(input,WaveFormat.CreateIeeeFloatWaveFormat(44100,2)))writer.WriteSamples(samples,0,samples.Length);
var separator=new AiSeparator(Path.Combine(workspace,".cache","spleeter"));
var progress=new Progress<(double,string)>();var started=System.Diagnostics.Stopwatch.StartNew();
separator.Separate(input,testRoot,progress,CancellationToken.None);var sum=new float[samples.Length];
foreach(var name in AiSeparator.Names){using var reader=new WaveFileReader(Path.Combine(testRoot,name+".wav"));var provider=reader.ToSampleProvider();var stem=new float[samples.Length];Require(provider.Read(stem,0,stem.Length)==stem.Length,"Incomplete AI stem");for(int i=0;i<sum.Length;i++){Require(float.IsFinite(stem[i]),"Invalid AI samples");sum[i]+=stem[i];}}
double squaredError=0,squaredSignal=0;for(int i=0;i<sum.Length;i++){squaredError+=(sum[i]-samples[i])*(sum[i]-samples[i]);squaredSignal+=samples[i]*samples[i];}
double relative=Math.Sqrt(squaredError/squaredSignal);Require(relative<.01,"AI mixture reconstruction changed the signal: "+relative);
results.Add(new{test="Bundled ONNX inference and four-stem overlap-add reconstruction",relativeRmsError=relative,seconds=started.Elapsed.TotalSeconds});
using(var cancellation=new CancellationTokenSource()){cancellation.Cancel();bool rejected=false;try{separator.Separate(input,testRoot,progress,cancellation.Token);}catch(OperationCanceledException){rejected=true;}Require(rejected,"Cancelled AI work continued");}
results.Add(new{test="Cancelled preparation exits before inference",passed=true});
var vlcRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".nuget","packages","videolan.libvlc.windows","3.0.24","build","x64");
var fixture=Path.Combine(workspace,".cache","native-fixture.mp4");
if(!File.Exists(fixture)){fixture=Path.Combine(testRoot,"fixture.wav");using var writer=new WaveFileWriter(fixture,WaveFormat.CreateIeeeFloatWaveFormat(44100,2));for(int repeat=0;repeat<3;repeat++)writer.WriteSamples(samples,0,samples.Length);}
Core.Initialize(vlcRoot);using(var vlc=new LibVLC("--no-video","--no-metadata-network-access")){
    using(var player=new MediaPlayer(vlc))using(var pipeline=new AudioPipeline(()=>vlc.Clock)){
        pipeline.SelectDevice(null);pipeline.Attach(player);pipeline.Renderer.Configure(true,0,45,.4f);
        using var media=new Media(vlc,new Uri(fixture));
        Require(player.Play(media),"Native playback could not start");await Task.Delay(2500);
        player.SetPause(true);await Task.Delay(200);player.Time=1000;player.Play();await Task.Delay(1500);player.Stop();
        Console.WriteLine($"Decode diagnostic: in={pipeline.MaximumInputPeak}, out={pipeline.MaximumPeak}, invalid={pipeline.InvalidInputSamples}");
        Require(pipeline.ReceivedBytes>48000,"LibVLC did not deliver decoded PCM");Require(pipeline.MaximumInputPeak<.06&&pipeline.InvalidInputSamples==0,"Decoded PCM format did not preserve the quiet fixture level");Require(pipeline.MaximumPeak>1e-5&&pipeline.MaximumPeak<.1,"WASAPI read path was silent or altered the quiet fixture level");
        results.Add(new{test="LibVLC decode / WASAPI render / pause / seek / resume",decodedBytes=pipeline.ReceivedBytes,maxInputSample=pipeline.MaximumInputPeak,maxRenderedSample=pipeline.MaximumPeak,droppedFrames=pipeline.DroppedFrames});
    }
    var prepared=await new AiSeparator(Path.Combine(workspace,".cache","spleeter"),Path.Combine(testRoot,"decoded-ai")).Prepare(fixture,vlc,progress,CancellationToken.None);
    Require(File.Exists(Path.Combine(prepared,"complete.json")),"Native decoding plus separation did not complete");
    results.Add(new{test="LibVLC file decode and bundled AI preparation without FFmpeg/Python",passed=true});
}
var json=JsonSerializer.Serialize(results,new JsonSerializerOptions{WriteIndented=true});Console.WriteLine(json);File.WriteAllText(Path.Combine(workspace,".cache","native-test-results.json"),json);
