using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace SonicOrbit.Native;
internal sealed class OutputNotifications(Action changed) : IMMNotificationClient
{
    public void OnDeviceStateChanged(string id,DeviceState state)=>changed();
    public void OnDeviceAdded(string id)=>changed();
    public void OnDeviceRemoved(string id)=>changed();
    public void OnDefaultDeviceChanged(DataFlow flow,Role role,string id){if(flow==DataFlow.Render&&role==Role.Multimedia)changed();}
    public void OnPropertyValueChanged(string id,PropertyKey key){}
}
