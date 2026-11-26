using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;

namespace SonicOrbit.Native;
internal sealed class OrientationReceiver(Action<double> pose,int port=4243) : IDisposable
{
    private readonly UdpClient socket=new(new IPEndPoint(IPAddress.Loopback,port));
    internal int Port=>((IPEndPoint)socket.Client.LocalEndPoint!).Port;
    private readonly CancellationTokenSource stop=new();
    private double centre;
    private double last;
    private int disposed;
    public DateTime LastReceivedUtc {get;private set;}
    public async Task Run()
    {
        try{while(!stop.IsCancellationRequested){var packet=await socket.ReceiveAsync(stop.Token);if(packet.Buffer.Length!=48||!IPAddress.IsLoopback(packet.RemoteEndPoint.Address))continue;
            double yaw=BitConverter.Int64BitsToDouble(BinaryPrimitives.ReadInt64LittleEndian(packet.Buffer.AsSpan(24,8)));
            if(!double.IsFinite(yaw)||Math.Abs(yaw)>36000)continue;last=yaw;LastReceivedUtc=DateTime.UtcNow;pose(Wrap(yaw-centre));
        }}catch(OperationCanceledException){}catch(ObjectDisposedException){}catch(SocketException)when(stop.IsCancellationRequested){}
    }
    public void Recenter()=>centre=last;
    private static double Wrap(double angle)=>((angle+180)%360+360)%360-180;
    public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;stop.Cancel();socket.Dispose();stop.Dispose();}
}
