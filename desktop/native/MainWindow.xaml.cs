using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Threading;
using LibVLCSharp.Shared;
using Microsoft.Win32;
using NAudio.CoreAudioApi;

namespace SonicOrbit.Native;
public partial class MainWindow : Window
{
    private LibVLC? vlc;
    private MediaPlayer? player;
    private AudioPipeline? audio;
    private readonly MMDeviceEnumerator enumerator=new();
    private readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromMilliseconds(200)};
    private CancellationTokenSource? preparing;
    private string? file;
    private bool dragging,changingDevices,closing;
    private bool readyToClose;
    private TaskCompletionSource? preparationFinished;
    private OutputNotifications? notifications;
    private OrientationReceiver? tracker;
    private readonly DispatcherTimer outputDebounce=new(){Interval=TimeSpan.FromMilliseconds(400)};
    private long generation;
    private sealed record Output(string Id,string Name){public override string ToString()=>Name;}
    public MainWindow()
    {
        InitializeComponent();Loaded+=Ready;Closing+=ClosingPlayer;PreviewKeyDown+=Keys;
        timer.Tick+=(_,_)=>{
            if(player==null)return;if(!dragging){Seek.Maximum=Math.Max(1,player.Length);Seek.Value=Math.Max(0,player.Time);}
            TimeLabel.Text=$"{FormatTime(player.Time)} / {FormatTime(player.Length)}";
            PlayButton.Content=player.IsPlaying?"Pause":"Play";
            if(tracker!=null)TrackingStatus.Text=(DateTime.UtcNow-tracker.LastReceivedUtc).TotalMilliseconds<500?"Receiving real OpenTrack yaw · screen anchored":"Waiting for tracker data · holding last heading";
        };
        outputDebounce.Tick+=(_,_)=>{outputDebounce.Stop();if(!closing)RefreshOutputs();};
    }
    private void Ready(object sender,RoutedEventArgs e)
    {
        try{
            Core.Initialize(Path.Combine(AppContext.BaseDirectory,"libvlc","win-x64"));
            vlc=new LibVLC("--no-video-title-show","--no-metadata-network-access","--no-sub-autodetect-file");
            player=new MediaPlayer(vlc);Video.MediaPlayer=player;
            audio=new AudioPipeline(()=>vlc.Clock);audio.Attach(player);audio.DeviceError+=message=>Dispatcher.InvokeAsync(()=>{if(!closing)Status.Text=message;});
            notifications=new OutputNotifications(()=>Dispatcher.InvokeAsync(()=>{if(!closing){outputDebounce.Stop();outputDebounce.Start();}}));enumerator.RegisterEndpointNotificationCallback(notifications);
            player.EncounteredError+=(_,_)=>Dispatcher.InvokeAsync(()=>Status.Text="Cannot play this file. Try another audio track or codec.");
            RefreshOutputs();ApplySound();timer.Start();
            AiStatus.Text=AiSeparator.Available?"AI model installed · local CPU preparation · first five minutes.":"The offline AI pack is missing. Reinstall the full native package.";
            PrepareAI.IsEnabled=AiSeparator.Available;
            if(file!=null)StartFile(file);
        }catch(Exception error){Status.Text="Player setup failed: "+error.Message;PrepareAI.IsEnabled=false;}
    }
    public void OpenFile(string path)
    {
        if(!File.Exists(path)){Status.Text="The selected file is unavailable.";return;}
        file=Path.GetFullPath(path);if(player!=null)StartFile(file);
    }
    private void StartFile(string path)
    {
        generation++;preparing?.Cancel();AiScene.IsChecked=false;AiScene.IsEnabled=false;audio?.SetStage(null);Progress.Value=0;
        AiStatus.Text=AiSeparator.Available?"AI model installed · prepare tracks for this file.":"The offline AI pack is missing. Reinstall the full native package.";
        player!.Stop();audio?.Flush();using var media=new Media(vlc!,new Uri(path));
        FileLabel.Text=Path.GetFileName(path);EmptyCover.Visibility=Visibility.Collapsed;
        if(!player.Play(media))Status.Text="The file could not be opened.";
        else Status.Text="Playing locally. Compare Original by switching spatial rendering off.";
    }
    private void OpenClick(object sender,RoutedEventArgs e)
    {
        var picker=new OpenFileDialog{Title="Open music or video",Filter="Media|*.mp4;*.mkv;*.webm;*.mov;*.avi;*.mp3;*.wav;*.flac;*.m4a;*.ogg;*.aac|All files|*.*"};if(picker.ShowDialog(this)==true)OpenFile(picker.FileName);
    }
    private void MediaDrop(object sender,DragEventArgs e){if(e.Data.GetData(DataFormats.FileDrop) is string[] paths&&paths.Length>0)OpenFile(paths[0]);}
    private void PlayClick(object sender,RoutedEventArgs e){if(player==null)return;if(player.IsPlaying)player.SetPause(true);else if(player.Media!=null)player.Play();else OpenClick(sender,e);}
    private void StopClick(object sender,RoutedEventArgs e){player?.Stop();audio?.Flush();}
    private void SeekBegin(object sender,MouseButtonEventArgs e){dragging=true;}
    private void SeekEnd(object sender,MouseButtonEventArgs e){if(player?.IsSeekable==true){audio?.Flush();player.Time=(long)Seek.Value;}dragging=false;}
    private void SoundChanged(object sender,RoutedEventArgs e){ApplySound();}
    private void ApplySound()
    {
        if(audio==null||Volume==null||Yaw==null||StageWidth==null)return;
        audio.Renderer.Configure(Spatial.IsChecked==true,(float)Yaw.Value,(float)StageWidth.Value,(float)Volume.Value/100);
        audio.SceneEnabled=AiScene.IsChecked==true&&Spatial.IsChecked==true;
        audio.ConfigureStage(ProfileName,(float)Yaw.Value,(float)Volume.Value/100);
    }
    private string ProfileName=>(Profile.SelectedItem as ComboBoxItem)?.Tag as string??"H3";
    private void ProfileChanged(object sender,SelectionChangedEventArgs e){if(audio==null)return;try{audio.Renderer.LoadProfile(ProfileName);ApplySound();}catch(Exception error){Status.Text=error.Message;}}
    private void LipSyncChanged(object sender,RoutedPropertyChangedEventArgs<double> e){if(audio!=null)audio.LipSyncMs=(int)e.NewValue;}
    private void TrackingChanged(object sender,RoutedEventArgs e)
    {
        tracker?.Dispose();tracker=null;if(Yaw==null)return;Yaw.IsEnabled=ExternalTracking.IsChecked!=true;
        if(ExternalTracking.IsChecked==true)try{tracker=new OrientationReceiver(yaw=>Dispatcher.InvokeAsync(()=>{if(!closing&&ExternalTracking.IsChecked==true)Yaw.Value=yaw;}));_ = tracker.Run();}
        catch(Exception error){ExternalTracking.IsChecked=false;TrackingStatus.Text="Tracker could not start: "+error.Message;}
        else TrackingStatus.Text="Optional tracker · loopback UDP 4243 · yaw only";
    }
    private void RecenterClick(object sender,RoutedEventArgs e){tracker?.Recenter();Yaw.Value=0;}
    private void RefreshDevices(object sender,RoutedEventArgs e){RefreshOutputs();}
    private void RefreshOutputs()
    {
        var selected=(Devices.SelectedItem as Output)?.Id??"default";changingDevices=true;
        var outputs=new List<Output>{new("default","System default · wired / Bluetooth")};
        foreach(var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render,DeviceState.Active)){outputs.Add(new(device.ID,device.FriendlyName));device.Dispose();}
        Devices.ItemsSource=outputs;Devices.SelectedItem=outputs.FirstOrDefault(output=>output.Id==selected)??outputs[0];changingDevices=false;
        SelectOutput();
    }
    private void DeviceChanged(object sender,SelectionChangedEventArgs e){if(!changingDevices)SelectOutput();}
    private void SelectOutput()
    {
        if(audio==null||Devices.SelectedItem is not Output output)return;
        try{using var device=output.Id=="default"?null:enumerator.GetDevice(output.Id);audio.SelectDevice(device);Status.Text="Output: "+output.Name+". Recheck lip sync after switching devices.";}
        catch(Exception error){Status.Text="Cannot open that output: "+error.Message;}
    }
    private async void PrepareClick(object sender,RoutedEventArgs e)
    {
        if(file==null){Status.Text="Open a local song or video first.";return;}
        if(preparing!=null)return;var version=generation;var source=file;preparing=new();var cancellation=preparing;
        PrepareAI.IsEnabled=false;CancelAI.IsEnabled=true;AiStatus.Text="Starting local AI preparation. Playback can continue.";
        preparationFinished=new(TaskCreationOptions.RunContinuationsAsynchronously);
        var progress=new Progress<(double,string)>(value=>{if(!closing&&version==generation){Progress.Value=value.Item1;AiStatus.Text=value.Item2;}});
        try{
            var directory=await new AiSeparator().Prepare(source,vlc!,progress,cancellation.Token);cancellation.Token.ThrowIfCancellationRequested();
            var stage=await Task.Run(()=>new StemStage(directory),cancellation.Token);
            if(closing||version!=generation||cancellation.IsCancellationRequested){stage.Dispose();return;}
            audio!.SetStage(stage);ApplySound();AiScene.IsEnabled=true;AiStatus.Text=$"AI tracks ready · {stage.Duration:F0} seconds · enable the front stage to listen.";
        }catch(OperationCanceledException){if(!closing&&version==generation)AiStatus.Text="Preparation cancelled. Ordinary playback is available.";}
        catch(Exception error){if(!closing&&version==generation)AiStatus.Text="AI preparation failed: "+error.Message;}
        finally{if(ReferenceEquals(preparing,cancellation))preparing=null;cancellation.Dispose();preparationFinished?.TrySetResult();if(!closing){CancelAI.IsEnabled=false;PrepareAI.IsEnabled=AiSeparator.Available;}}
    }
    private void CancelClick(object sender,RoutedEventArgs e){preparing?.Cancel();CancelAI.IsEnabled=false;AiStatus.Text="Stopping local preparation…";}
    private void AiSceneChanged(object sender,RoutedEventArgs e){ApplySound();audio?.Flush();}
    private void Keys(object sender,KeyEventArgs e){if(e.Key==Key.Space&&Keyboard.FocusedElement is not (Slider or ButtonBase or ComboBox or TextBoxBase)){PlayClick(sender,e);e.Handled=true;}if(e.Key==Key.O&&Keyboard.Modifiers==ModifierKeys.Control){OpenClick(sender,e);e.Handled=true;}}
    private async void ClosingPlayer(object? sender,System.ComponentModel.CancelEventArgs e)
    {
        if(readyToClose)return;e.Cancel=true;if(closing)return;
        closing=true;generation++;timer.Stop();outputDebounce.Stop();tracker?.Dispose();preparing?.Cancel();Status.Text="Closing local audio and AI workers…";
        if(preparationFinished!=null)await preparationFinished.Task;
        Video.MediaPlayer=null;player?.Stop();player?.Dispose();audio?.Dispose();vlc?.Dispose();if(notifications!=null)enumerator.UnregisterEndpointNotificationCallback(notifications);enumerator.Dispose();readyToClose=true;Close();
    }
    private static string FormatTime(long milliseconds)=>TimeSpan.FromMilliseconds(Math.Max(0,milliseconds)).ToString(milliseconds>=3600000?@"h\:mm\:ss":@"mm\:ss");
}
