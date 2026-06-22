import { ipcMain } from 'electron';
import { store } from '../services/store';

export function registerLayoutIpc() {
  ipcMain.handle('layout:get', () => store.getLayout());
  ipcMain.handle('layout:save', (_e, layout: unknown) => {
    store.saveLayout(layout);
  });
}
