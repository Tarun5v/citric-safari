# Citric
Citric is a Safari extension that gives YouTube watch pages a simpler video
player. Click the picture to pause or resume. Move the pointer over the
video to show the controls for seeking, volume, Picture in
Picture, AirPlay, and fullscreen.
## Why I built Citric

YouTube ads were a big reason I started Citric. I wanted fewer interruptions when watching in Safari, and I didn’t want to pay for a subscription just for that. I started with the part I could change: the player interface. Citric gives me the video and the controls I use most, including Picture in Picture and AirPlay. When an ad plays and seeking is available, I can use Citric’s controls to skip ahead. The harder part was keeping playback working when YouTube switches videos or changes which streams it offers.

## Demo
<img width="1100" height="758" alt="Citric-README-preview" src="https://github.com/user-attachments/assets/69dfb7f9-dae0-4b1f-906c-17923e3f8448" />

https://github.com/user-attachments/assets/aa6b0cca-7e06-4e9e-8f40-8926ee31e3d7
## Install Citric on macOS

### Download and open the app

1. Open the [latest Citric release](https://github.com/Tarun5v/citric-safari/releases/latest) and download the DMG under **Assets**.
2. Open the DMG, drag **Citric** into **Applications**, then open it from **Applications**.
3. If macOS shows **“Citric” Not Opened**, click **Done**. Only continue if you downloaded the DMG from this repository and trust the build.

   <img width="250" height="267" alt="macOS warning that Citric was not opened" src="https://github.com/user-attachments/assets/5d85d924-a12b-40bb-9a6c-d6206e32e0e7" />

4. Open **System Settings → Privacy & Security**, scroll down to **Security**, and click **Open Anyway** next to the message that Citric was blocked.

   <img width="420" height="153" alt="Open Anyway in Privacy & Security" src="https://github.com/user-attachments/assets/e7a52865-bb5b-4027-92fd-deb04fb9feda" />

5. In the **Open “Citric”?** dialog, click **Open Anyway** again. If macOS asks you to authenticate, use Touch ID or click **Use Password...** and enter your Mac administrator credentials.

   <img width="520" height="359" alt="Open Citric confirmation dialog" src="https://github.com/user-attachments/assets/9ca7a911-4cce-4018-a5e2-6dd13aa34ce0" />

   <img width="520" height="369" alt="macOS administrator authentication prompt" src="https://github.com/user-attachments/assets/d303b909-d5a4-4cdf-a93b-217a296b4765" />

### Enable Citric in Safari

1. Open Citric if it hasn’t opened yet. In the **Enable Citric in Safari** window, click **Open Safari Extensions**.

   <img width="430" height="316" alt="Citric’s Open Safari Extensions button" src="https://github.com/user-attachments/assets/cd9adfa5-d986-4bae-ac4d-212d58432b6f" />

2. Safari opens its **Extensions** settings. Switch to **Advanced** and select **Show features for web developers** at the bottom.

   <img width="520" height="382" alt="Safari Extensions settings" src="https://github.com/user-attachments/assets/491fdb76-c9d8-42d9-8ae0-d448fbdf7264" />

   <img width="520" height="418" alt="Show features for web developers in Advanced settings" src="https://github.com/user-attachments/assets/7b93f0a8-d513-484b-8164-746109927875" />

3. Open the new **Developer** tab. Under **Extensions**, select **Allow unsigned extensions** for this build.

   <img width="520" height="264" alt="Allow unsigned extensions in Developer settings" src="https://github.com/user-attachments/assets/fa8a3fa7-1023-480c-976c-2efd975b6fe6" />
4. Return to **Extensions** and enable **Citric**. Open a YouTube watch page and allow Citric to access YouTube when Safari asks.

## Keyboard shortcuts
You can press `K` or Space to pause and resume. Use `J` or `L` to jump
10 seconds backward or forward. Press `M` to mute and `F` for fullscreen.
## How playback works
Citric looks for YouTube's `#movie_player` and adds its own controls in an
overlay. When YouTube exposes a direct stream that contains both audio and
video, Citric tries to play it in a separate HTML video element. If those streams don't load, Citric uses YouTube's existing video element and lets
YouTube continue managing playback.
YouTube can switch videos without reloading the page. Citric listens for
`yt-navigate-finish` and watches for changes to the player. Before trying a
direct stream, it checks that the player response matches the video ID in
the URL.
### What I learned building it

- **Stream selection.** Some YouTube responses include a single URL with both audio and video. Others deliver them separately. I used the combined streams when available and kept YouTube’s own video element as the fallback. That let me change the interface without building a separate adaptive streaming player.
- **Client-side navigation.** YouTube can reuse the same player container when you click a recommendation. The old player response can still be present after the URL changes. I check the video ID before using a response and watch for YouTube to replace its video element.
- **Fullscreen in Safari.** The overlay could leave black strips when Safari entered fullscreen. I sized it with percentages in fullscreen and restored its in-page placement when fullscreen ended. Fullscreening the overlay also keeps Citric’s controls with the video.

## Permissions and privacy
The manifest declares `activeTab` and `scripting` and loads `content.js`
on YouTube. Citric requires no account and includes no analytics code.
## Development
Edit `content.js` for player behavior, `manifest.json` for extension
settings, and `icons/` for artwork. Check the script before reloading the
extension in Safari:
```sh
node --check content.js
```
If you've changed playback code, start with a fresh YouTube watch page.
Then click a recommended video and check that the controls still work.
In your pull request, mention which playback paths you've tested.
## License
Citric is available under the [MIT License](./LICENSE).
