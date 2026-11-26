using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace SonicOrbit.Native;
internal sealed partial class NativeRenderer : IDisposable
{
    private IntPtr handle = so_create();
    private readonly object gate = new();
    private int reset;
    public NativeRenderer() { if(handle==IntPtr.Zero)throw new InvalidOperationException("The native audio renderer could not start."); LoadProfile("H3"); }
    public void LoadProfile(string name)
    {
        if(name is not ("H3" or "H17"))throw new ArgumentException("Unknown ear profile.");
        var root=Path.Combine(AppContext.BaseDirectory,"assets","hrtf");
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,name+".json")));
        var meta=json.RootElement;var bytes=File.ReadAllBytes(Path.Combine(root,name+".bin"));
        if(meta.GetProperty("sampleRate").GetInt32()!=48000||meta.GetProperty("taps").GetInt32()!=256||!Convert.ToHexString(SHA256.HashData(bytes)).Equals(meta.GetProperty("sha256").GetString(),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Headphone profile integrity check failed.");
        var angles=meta.GetProperty("positions").EnumerateArray().SelectMany(pair=>pair.EnumerateArray().Select(x=>x.GetSingle())).ToArray();
        if(bytes.Length!=angles.Length*256*4)throw new InvalidDataException("Invalid headphone profile size.");
        var impulses=new float[bytes.Length/4];Buffer.BlockCopy(bytes,0,impulses,0,bytes.Length);
        lock(gate){if(so_load_hrtf(handle,angles,impulses,angles.Length/2,256)==0)throw new InvalidDataException("Headphone profile was rejected.");}
    }
    public void Configure(bool spatial,float yaw,float width,float volume,float anchor=.65f) { lock(gate)so_configure(handle,spatial?1:0,yaw,width,anchor,volume); }
    public unsafe void Process(byte[] buffer,int offset,int count) { if(count==0)return;if(Interlocked.Exchange(ref reset,0)!=0)so_reset(handle);fixed(byte* pointer=&buffer[offset])so_process(handle,(IntPtr)pointer,count/8); }
    public void Reset(){Interlocked.Exchange(ref reset,1);}
    public void Dispose(){lock(gate){if(handle!=IntPtr.Zero){so_destroy(handle);handle=IntPtr.Zero;}}}
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern IntPtr so_create();
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern void so_destroy(IntPtr handle);
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern int so_load_hrtf(IntPtr handle,float[] angles,float[] impulses,int positions,int taps);
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern void so_configure(IntPtr handle,int spatial,float yaw,float width,float anchor,float volume);
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern void so_reset(IntPtr handle);
    [DllImport("sonicorbit_dsp",CallingConvention=CallingConvention.Cdecl)] private static extern void so_process(IntPtr handle,IntPtr data,int frames);
}
