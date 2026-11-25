using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Launcher {
  static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
  static readonly string Node=Path.Combine(Root,"runtime","node.exe");
  static readonly string State=Path.Combine(Root,".cache","desktop-state.json");
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static bool Running(out int port){
    port=0;
    try {
      var state=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(State));
      int pid=Convert.ToInt32(state["pid"]);port=Convert.ToInt32(state["port"]);
      var process=Process.GetProcessById(pid);
      return !process.HasExited&&String.Equals(process.MainModule.FileName,Node,StringComparison.OrdinalIgnoreCase)&&process.StartTime.ToUniversalTime().Ticks==Convert.ToInt64(state["started"]);
    }catch{return false;}
  }
  static Dictionary<string,object> Session(int port){
    using(var client=new WebClient()){client.Proxy=null;return Json.Deserialize<Dictionary<string,object>>(client.DownloadString("http://127.0.0.1:"+port+"/api/session"));}
  }
  static void Open(int port){Process.Start(new ProcessStartInfo("http://127.0.0.1:"+port){UseShellExecute=true});}
  [STAThread] static void Main(string[] args){
    bool background=Array.IndexOf(args,"--background")>=0;
    try {
      int port;
      if(args.Length>0&&args[0]=="--stop"){
        if(Running(out port)){
          var session=Session(port);string origin="http://127.0.0.1:"+port;
          var request=(HttpWebRequest)WebRequest.Create(origin+"/api/shutdown");request.Proxy=null;request.Method="POST";request.Headers["Origin"]=origin;request.Headers["X-360-Token"]=Convert.ToString(session["token"]);request.ContentLength=0;
          using(var response=request.GetResponse()){}
        }return;
      }
      if(Running(out port)){Session(port);if(!background)Open(port);return;}
      if(!File.Exists(Node))throw new Exception("Extract the entire SonicOrbit ZIP before launching it. The runtime folder must stay beside SonicOrbit.exe.");
      port=0;for(int candidate=3600;candidate<=3699;candidate++){
        var listener=new TcpListener(IPAddress.Loopback,candidate);
        try{listener.Start();listener.Stop();port=candidate;break;}catch(SocketException){listener.Stop();}
      }
      if(port==0)throw new Exception("No local player port is available between 3600 and 3699.");
      var start=new ProcessStartInfo(Node,"\""+Path.Combine(Root,"server.mjs")+"\""){WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true};start.EnvironmentVariables["PORT"]=port.ToString();
      var server=Process.Start(start);Directory.CreateDirectory(Path.GetDirectoryName(State));
      File.WriteAllText(State,Json.Serialize(new{pid=server.Id,port=port,started=server.StartTime.ToUniversalTime().Ticks}));
      for(int attempt=0;attempt<120;attempt++){
        if(server.HasExited)throw new Exception("The local audio server exited. Try running Start-SonicOrbit.cmd for diagnostics.");
        try{Session(port);if(!background)Open(port);return;}catch(WebException){System.Threading.Thread.Sleep(100);}
      }
      throw new Exception("SonicOrbit is taking longer than expected to start. Try again, or use Start-SonicOrbit.cmd for diagnostics.");
    }catch(Exception error){Environment.ExitCode=1;if(!background)MessageBox.Show(error.Message,"SonicOrbit",MessageBoxButtons.OK,MessageBoxIcon.Information);}
  }
}
