using System.IO;
using System.Windows;

namespace SonicOrbit.Native;
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) => { MessageBox.Show(args.Exception.Message, "SonicOrbit"); args.Handled = true; };
        if (e.Args.Contains("--verify-install"))
        {
            try { InstallVerifier.Verify(AppContext.BaseDirectory); Environment.ExitCode = 0; }
            catch (Exception error) { File.WriteAllText(Path.Combine(Path.GetTempPath(), "sonicorbit-install-error.txt"), error.ToString()); Environment.ExitCode = 1; }
            Shutdown(); return;
        }
        var window = new MainWindow(); MainWindow = window; window.Show();
        var file = e.Args.FirstOrDefault(arg => !arg.StartsWith("--") && File.Exists(arg));
        if (file != null) window.OpenFile(file);
    }
}
