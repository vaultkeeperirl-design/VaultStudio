import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { GlobalStyles } from './theme/GlobalStyles';

const activeStreams = new Set<MediaStream>();
const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (constraints) => {
  const stream = await origGetUserMedia(constraints);
  activeStreams.add(stream);
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => activeStreams.delete(stream));
  });
  return stream;
};

window.addEventListener('beforeunload', () => {
  for (const s of activeStreams) {
    s.getTracks().forEach((t) => t.stop());
  }
  activeStreams.clear();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalStyles />
    <App />
  </React.StrictMode>
);
