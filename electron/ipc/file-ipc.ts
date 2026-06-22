import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';

export function registerFileIpc() {
  ipcMain.handle('files:selectImage', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select image source',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);

    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('files:selectMedia', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select media file',
      properties: ['openFile'],
      filters: [
        { name: 'Media', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'mp3', 'wav', 'flac', 'ogg', 'aac'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);

    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  const VIDEO_EXT = ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'm4v', 'ts', 'mpg', 'mpeg', 'wmv'];
  const AUDIO_EXT = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus', 'wma'];

  ipcMain.handle('files:selectVideo', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select video file',
      properties: ['openFile'],
      filters: [
        { name: 'Video', extensions: VIDEO_EXT },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('files:selectAudio', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select audio track',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: AUDIO_EXT },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  // Playlist accepts several files at once (VLC Video Source plays them in order).
  ipcMain.handle('files:selectPlaylist', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select playlist files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: [...VIDEO_EXT, ...AUDIO_EXT] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    return result.filePaths;
  });
}
