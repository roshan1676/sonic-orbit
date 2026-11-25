package io.github.roshan1676.sonicorbit;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import org.json.JSONObject;

/** Foreground local player. No network, microphone, camera or capture permissions. */
public class MainActivity extends Activity {
  private static final String HOST="sound360.local";
  private static final int PICK_MEDIA=360;
  private WebView web;
  private Button openMedia;
  private boolean choosing=false;
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private volatile MediaFile selected;
  private volatile boolean copying=false, destroyed=false;
  private AudioManager audioManager;
  private AudioFocusRequest focus;
  private static class MediaFile {
    final File file; final String key,name,mime;
    MediaFile(File f,String k,String n,String m){file=f;key=k;name=n;mime=m;}
  }
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
    openMedia=new Button(this);openMedia.setText("Open music or video");openMedia.setOnClickListener(view->chooseMedia());layout.addView(openMedia);
    web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,0,1));setContentView(layout);
    web.setBackgroundColor(0xff11180f);
    layout.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
    audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);
    focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).setOnAudioFocusChangeListener(change->{if(change<0)pausePlayback();}).build();
    web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMediaPlaybackRequiresUserGesture(true);
    web.setWebChromeClient(new WebChromeClient());
    web.addJavascriptInterface(new LocalBridge(),"Sound360Android");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !isLocal(request.getUrl());}
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return serve(request);}
    });
    web.loadUrl("https://"+HOST+"/assets/index.html");
  }
  private boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost());}
  private void js(String code){runOnUiThread(()->{if(!destroyed)web.evaluateJavascript(code,null);});}
  private void pausePlayback(){js("window.pauseSound360 && window.pauseSound360()");}
  private void chooseMedia(){
    if(copying||choosing||destroyed)return;
    try{
      Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/*","video/*"});
      choosing=true;startActivityForResult(intent,PICK_MEDIA);
    }catch(ActivityNotFoundException|SecurityException error){choosing=false;android.widget.Toast.makeText(this,"Cannot open the system file picker. Enable a Files/Documents app and try again.",android.widget.Toast.LENGTH_LONG).show();}
  }
  public final class LocalBridge {
    @JavascriptInterface public void chooseMedia(){runOnUiThread(()->MainActivity.this.chooseMedia());}
    @JavascriptInterface public void audioFocus(){runOnUiThread(()->audioManager.requestAudioFocus(focus));}
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==PICK_MEDIA)choosing=false;
    if(request!=PICK_MEDIA||result!=RESULT_OK||data==null||data.getData()==null)return;
    final Uri uri=data.getData();copying=true;openMedia.setEnabled(false);js("window.mobileMediaLoading && window.mobileMediaLoading()");
    io.execute(()->{
      File file=null;
      try{
        String mime=getContentResolver().getType(uri);if(mime==null||!(mime.startsWith("audio/")||mime.startsWith("video/")))throw new IOException("Choose an audio or video file.");
        String name="Selected media";
        try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}
        File cache=new File(getCacheDir(),"selected-media");if(!cache.exists()&&!cache.mkdirs())throw new IOException("Cannot create private media cache.");
        String key=UUID.randomUUID().toString();file=new File(cache,key);
        try(InputStream input=getContentResolver().openInputStream(uri);OutputStream output=new FileOutputStream(file)){
          if(input==null)throw new IOException("Cannot read selected file.");byte[] buffer=new byte[65536];int count;long size=0;
          while((count=input.read(buffer))!=-1){size+=count;if(size>1024L*1024*1024)throw new IOException("This preview supports files up to 1 GB.");output.write(buffer,0,count);}
          if(size==0)throw new IOException("Selected file is empty.");
        }
        if(destroyed){file.delete();return;}
        MediaFile previous=selected;selected=new MediaFile(file,key,name,mime);if(previous!=null)previous.file.delete();
        JSONObject item=new JSONObject();item.put("name",name);item.put("url","https://"+HOST+"/media/"+key);item.put("bytes",file.length());js("window.mobileMediaReady("+item.toString()+")");
      }catch(Exception error){if(file!=null)file.delete();js("window.mobileMediaError("+JSONObject.quote(error.getMessage()==null?"Cannot open this file.":error.getMessage())+")");}
      finally{copying=false;runOnUiThread(()->{if(!destroyed)openMedia.setEnabled(true);});}
    });
  }
  private WebResourceResponse serve(WebResourceRequest request){
    try{
      Uri uri=request.getUrl();if(!isLocal(uri))return error(403,"External requests are disabled.");
      if(!request.getMethod().equals("GET")&&!request.getMethod().equals("HEAD"))return error(405,"Method not allowed.");
      String path=uri.getPath();
      if(path!=null&&path.startsWith("/assets/")&&!path.contains("..")&&!path.contains("\\")){
        String name=path.substring(8),mime=name.endsWith(".html")?"text/html":name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".json")?"application/json":name.endsWith(".txt")?"text/plain":"application/octet-stream";
        return response(mime,200,"OK",new HashMap<>(),getAssets().open(name));
      }
      MediaFile item=selected;if(item==null||!path.equals("/media/"+item.key))return error(404,"Not found.");
      long size=item.file.length(),start=0,end=size-1;String range=null;
      for(Map.Entry<String,String> header:request.getRequestHeaders().entrySet())if(header.getKey().equalsIgnoreCase("Range"))range=header.getValue();
      if(range!=null){
        Matcher matcher=Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range);
        if(!matcher.matches()||(matcher.group(1).isEmpty()&&matcher.group(2).isEmpty()))return rangeError(size);
        if(matcher.group(1).isEmpty()){long suffix=Long.parseLong(matcher.group(2));if(suffix<=0)return rangeError(size);start=Math.max(0,size-suffix);}
        else{start=Long.parseLong(matcher.group(1));if(!matcher.group(2).isEmpty())end=Math.min(end,Long.parseLong(matcher.group(2)));}
        if(start<0||start>=size||end<start)return rangeError(size);
      }
      Map<String,String> headers=new HashMap<>();headers.put("Accept-Ranges","bytes");headers.put("Content-Length",Long.toString(end-start+1));if(range!=null)headers.put("Content-Range","bytes "+start+"-"+end+"/"+size);
      InputStream input;
      if(request.getMethod().equals("HEAD"))input=new ByteArrayInputStream(new byte[0]);
      else{FileInputStream file=new FileInputStream(item.file);file.getChannel().position(start);input=new LimitedInput(file,end-start+1);}
      return response(item.mime,range==null?200:206,range==null?"OK":"Partial Content",headers,input);
    }catch(Exception error){return error(404,"Resource unavailable.");}
  }
  private WebResourceResponse response(String mime,int status,String reason,Map<String,String> headers,InputStream input){
    headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'");
    return new WebResourceResponse(mime,null,status,reason,headers,input);
  }
  private WebResourceResponse error(int code,String text){return response("text/plain",code,"Error",new HashMap<>(),new ByteArrayInputStream(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
  private WebResourceResponse rangeError(long size){Map<String,String> headers=new HashMap<>();headers.put("Content-Range","bytes */"+size);return response("text/plain",416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));}
  private static class LimitedInput extends FilterInputStream {
    private long remaining;
    LimitedInput(InputStream input,long count){super(input);remaining=count;}
    @Override public int read()throws IOException{if(remaining<=0)return -1;int value=super.read();if(value!=-1)remaining--;return value;}
    @Override public int read(byte[] buffer,int offset,int count)throws IOException{if(remaining<=0)return -1;int read=in.read(buffer,offset,(int)Math.min(count,remaining));if(read>0)remaining-=read;return read;}
    @Override public long skip(long count)throws IOException{long skipped=in.skip(Math.min(count,remaining));remaining-=skipped;return skipped;}
    @Override public int available()throws IOException{return (int)Math.min(in.available(),remaining);}
  }
  @Override protected void onPause(){pausePlayback();audioManager.abandonAudioFocusRequest(focus);super.onPause();web.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
  @Override protected void onDestroy(){destroyed=true;io.shutdown();if(selected!=null)selected.file.delete();web.destroy();super.onDestroy();}
}
