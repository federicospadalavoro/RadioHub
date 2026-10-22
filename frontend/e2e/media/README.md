# Audio di prova

File di silenzio sintetico di 60 secondi, generati con FFmpeg. Non contengono trasmissioni radio o registrazioni dell'utente.

`radio.mp3` prova l'audio diretto. `radio.m3u8` e `segment-*.ts` provano HLS: qui `.ts` significa MPEG Transport Stream, non TypeScript. Questi file binari sono esclusi da ESLint e Prettier e non entrano nel sito pubblicato.

Per rigenerarli dalla cartella frontend (FFmpeg serve solo per questa operazione):

```sh
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -c:a libmp3lame -b:a 32k e2e/media/radio.mp3
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -c:a aac -b:a 64k -f hls -hls_time 10 -hls_list_size 0 -hls_playlist_type vod -hls_segment_filename e2e/media/segment-%02d.ts e2e/media/radio.m3u8
```
