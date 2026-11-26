using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using LibVLCSharp.Shared;
using Microsoft.ML.OnnxRuntime;

namespace SonicOrbit.Native;
internal static class InstallVerifier
{
    public static void Verify(string root)
    {
        using var renderer=new NativeRenderer();renderer.LoadProfile("H17");
        using var manifest=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"assets","models","manifest.json")));
        var model=Path.Combine(root,"assets","models","spleeter-4stems.onnx");
        using var stream=File.OpenRead(model);var hash=Convert.ToHexString(SHA256.HashData(stream));
        if(!hash.Equals(manifest.RootElement.GetProperty("sha256").GetString(),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("AI model checksum mismatch.");
        using var session=new InferenceSession(model,new SessionOptions{IntraOpNumThreads=1});
        if(session.InputMetadata.Count!=1||session.OutputMetadata.Count!=4)throw new InvalidDataException("Invalid AI graph.");
        Core.Initialize(Path.Combine(root,"libvlc","win-x64"));using var vlc=new LibVLC("--no-metadata-network-access");
        if(string.IsNullOrWhiteSpace(vlc.Version))throw new InvalidDataException("The playback engine is unavailable.");
        var required=new[]{"msvcp140.dll","msvcp140_1.dll","vcruntime140.dll","vcruntime140_1.dll"};
        if(required.Any(name=>!File.Exists(Path.Combine(root,name))))throw new InvalidDataException("The bundled Visual C++ runtime is incomplete.");
        var modules=System.Diagnostics.Process.GetCurrentProcess().Modules.Cast<System.Diagnostics.ProcessModule>()
            .Where(module=>required.Contains(module.ModuleName,StringComparer.OrdinalIgnoreCase))
            .Select(module=>new{name=module.ModuleName,loadedFromApplication=module.FileName.StartsWith(root,StringComparison.OrdinalIgnoreCase)}).ToArray();
        File.WriteAllText(Path.Combine(Path.GetTempPath(),"sonicorbit-install-verification.json"),JsonSerializer.Serialize(new{verified=true,selfContainedRuntime=File.Exists(Path.Combine(root,"coreclr.dll")),modelVerified=true,modules},new JsonSerializerOptions{WriteIndented=true}));
    }
}
