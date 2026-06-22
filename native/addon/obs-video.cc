/*
 * obs-video.cc — live preview frame streaming via a libobs raw video callback.
 * Frames are JPEG-encoded in the engine process before IPC so the Electron
 * renderer can paint a single in-DOM preview canvas without a native window.
 */
#include <napi.h>

#include "vs-common.h"

#include <util/platform.h>

#include <atomic>
#include <cstring>
#include <vector>

#if defined(_WIN32)

#include <windows.h>
#include <wincodec.h>

#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "ole32.lib")

static Napi::ThreadSafeFunction g_previewTsfn = nullptr;
static std::atomic<bool> g_previewActive{false};
static std::atomic<bool> g_frameInFlight{false};
static std::atomic<uint64_t> g_lastFrameNs{0};
static std::atomic<uint64_t> g_minIntervalNs{33333333ULL}; // 30 fps default
static uint32_t g_previewWidth = 640;
static uint32_t g_previewHeight = 360;

struct PreviewFrame {
  uint32_t width;
  uint32_t height;
  std::vector<uint8_t> jpeg;
};

static void putU16(uint8_t* p, uint16_t v) { memcpy(p, &v, 2); }
static void putU32(uint8_t* p, uint32_t v) { memcpy(p, &v, 4); }
static void putI32(uint8_t* p, int32_t v) { memcpy(p, &v, 4); }

static uint32_t getUint(Napi::Object obj, const char* key, uint32_t fallback = 1) {
  if (!obj.Has(key) || !obj.Get(key).IsNumber()) return fallback;
  uint32_t value = obj.Get(key).As<Napi::Number>().Uint32Value();
  return value == 0 ? fallback : value;
}

// JPEG-encode a BGRA frame via Windows Imaging Component (system library, no
// extra deps). Compressing in the engine before IPC turns a ~1.6MB uncompressed
// frame into ~40KB, which lets the live preview hit its target framerate over
// IPC. Runs on the libobs raw-video thread; the
// factory is created once and reused.
static IWICImagingFactory* g_wicFactory = nullptr;

static bool ensureWicFactory() {
  if (g_wicFactory) return true;
  // Ensure COM is initialized on this (libobs raw-video) thread. Any apartment
  // works for an in-proc WIC factory; ignore RPC_E_CHANGED_MODE if already init.
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&g_wicFactory));
  return SUCCEEDED(hr) && g_wicFactory != nullptr;
}

static bool encodeBgraToJpeg(const uint8_t* bgra, uint32_t w, uint32_t h, uint32_t stride,
                             std::vector<uint8_t>& out, float quality) {
  if (!ensureWicFactory()) return false;

  bool ok = false;
  IWICBitmap* bitmap = nullptr;
  IStream* stream = nullptr;
  IWICBitmapEncoder* encoder = nullptr;
  IWICBitmapFrameEncode* frameEnc = nullptr;
  IPropertyBag2* props = nullptr;

  do {
    if (FAILED(g_wicFactory->CreateBitmapFromMemory(w, h, GUID_WICPixelFormat32bppBGRA,
              stride, stride * h, const_cast<BYTE*>(bgra), &bitmap))) break;
    if (FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &stream))) break;
    if (FAILED(g_wicFactory->CreateEncoder(GUID_ContainerFormatJpeg, nullptr, &encoder))) break;
    if (FAILED(encoder->Initialize(stream, WICBitmapEncoderNoCache))) break;
    if (FAILED(encoder->CreateNewFrame(&frameEnc, &props))) break;

    PROPBAG2 opt = {};
    opt.pstrName = const_cast<LPOLESTR>(L"ImageQuality");
    VARIANT v;
    VariantInit(&v);
    v.vt = VT_R4;
    v.fltVal = quality;
    props->Write(1, &opt, &v);

    if (FAILED(frameEnc->Initialize(props))) break;
    if (FAILED(frameEnc->SetSize(w, h))) break;
    // WriteSource converts 32bppBGRA -> the JPEG-supported format (24bppBGR).
    // Writing the BGRA bytes directly via WritePixels mis-strides into grayscale
    // scanlines because the JPEG frame negotiates its pixel format down to 24bpp.
    if (FAILED(frameEnc->WriteSource(bitmap, nullptr))) break;
    if (FAILED(frameEnc->Commit())) break;
    if (FAILED(encoder->Commit())) break;

    STATSTG stat = {};
    if (FAILED(stream->Stat(&stat, STATFLAG_NONAME))) break;
    const ULONG size = stat.cbSize.LowPart;
    out.resize(size);
    LARGE_INTEGER zero = {};
    stream->Seek(zero, STREAM_SEEK_SET, nullptr);
    ULONG readBytes = 0;
    if (FAILED(stream->Read(out.data(), size, &readBytes))) break;
    out.resize(readBytes);
    ok = true;
  } while (false);

  if (bitmap) bitmap->Release();
  if (props) props->Release();
  if (frameEnc) frameEnc->Release();
  if (encoder) encoder->Release();
  if (stream) stream->Release();
  return ok;
}

static void onRawVideo(void* /*param*/, struct video_data* frame) {
  if (!g_previewActive || !g_previewTsfn || !frame || !frame->data[0]) return;

  uint64_t now = os_gettime_ns();
  uint64_t last = g_lastFrameNs.load(std::memory_order_relaxed);
  if (now - last < g_minIntervalNs.load(std::memory_order_relaxed)) return;
  if (g_frameInFlight.exchange(true, std::memory_order_acq_rel)) return;
  g_lastFrameNs.store(now, std::memory_order_relaxed);

  const uint32_t w = g_previewWidth;
  const uint32_t h = g_previewHeight;

  auto* pf = new PreviewFrame();
  pf->width = w;
  pf->height = h;
  if (!encodeBgraToJpeg(frame->data[0], w, h, frame->linesize[0], pf->jpeg, 0.6f)) {
    delete pf;
    g_frameInFlight.store(false, std::memory_order_release);
    return;
  }

  napi_status status = g_previewTsfn.NonBlockingCall(pf,
    [](Napi::Env env, Napi::Function jsCallback, PreviewFrame* data) {
      auto buf = Napi::Buffer<uint8_t>::Copy(env, data->jpeg.data(), data->jpeg.size());
      auto obj = Napi::Object::New(env);
      obj.Set("width", data->width);
      obj.Set("height", data->height);
      obj.Set("data", buf);
      jsCallback.Call({obj});
      delete data;
      g_frameInFlight.store(false, std::memory_order_release);
    });
  if (status != napi_ok) {
    delete pf;
    g_frameInFlight.store(false, std::memory_order_release);
  }
}

void VsStopPreviewInternal() {
  if (g_previewActive.exchange(false)) {
    obs_remove_raw_video_callback(onRawVideo, nullptr);
  }
  if (g_previewTsfn) {
    g_previewTsfn.Release();
    g_previewTsfn = nullptr;
  }
  g_frameInFlight = false;
}

/** startPreview(callback, { width?, height?, fps? }) */
Napi::Value StartPreview(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::Error::New(env, "startPreview requires a callback").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  VsStopPreviewInternal();

  uint32_t width = 960, height = 540, fps = 30;
  if (info.Length() > 1 && info[1].IsObject()) {
    auto o = info[1].As<Napi::Object>();
    if (o.Has("width")) width = o.Get("width").As<Napi::Number>().Uint32Value();
    if (o.Has("height")) height = o.Get("height").As<Napi::Number>().Uint32Value();
    if (o.Has("fps")) fps = o.Get("fps").As<Napi::Number>().Uint32Value();
  }
  if (fps < 1) fps = 1;
  if (fps > 60) fps = 60;
  g_previewWidth = width;
  g_previewHeight = height;
  g_minIntervalNs = 1000000000ULL / fps - 1000000ULL; // small slack for timer jitter

  g_previewTsfn = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "PreviewCallback", 1, 1);

  struct video_scale_info conversion = {};
  conversion.format = VIDEO_FORMAT_BGRA;
  conversion.width = width;
  conversion.height = height;
  conversion.range = VIDEO_RANGE_FULL;
  conversion.colorspace = VIDEO_CS_DEFAULT;

  g_lastFrameNs = 0;
  g_previewActive = true;
  obs_add_raw_video_callback(&conversion, onRawVideo, nullptr);
  return Napi::Boolean::New(env, true);
}

Napi::Value StopPreview(const Napi::CallbackInfo& info) {
  VsStopPreviewInternal();
  return Napi::Boolean::New(info.Env(), true);
}

#else

static Napi::ThreadSafeFunction g_previewTsfn = nullptr;
static std::atomic<bool> g_previewActive{false};
static std::atomic<bool> g_frameInFlight{false};
static std::atomic<uint64_t> g_lastFrameNs{0};
static std::atomic<uint64_t> g_minIntervalNs{33333333ULL};
static uint32_t g_previewWidth = 640;
static uint32_t g_previewHeight = 360;

struct PreviewFrame {
  uint32_t width;
  uint32_t height;
  std::vector<uint8_t> image;
};

static void putU16(uint8_t* p, uint16_t v) { memcpy(p, &v, 2); }
static void putU32(uint8_t* p, uint32_t v) { memcpy(p, &v, 4); }
static void putI32(uint8_t* p, int32_t v) { memcpy(p, &v, 4); }

static bool encodeBgraToBmp(const uint8_t* bgra, uint32_t w, uint32_t h, uint32_t stride,
                            std::vector<uint8_t>& out) {
  if (!bgra || w == 0 || h == 0 || stride == 0) return false;
  const uint32_t rowSize = ((w * 3 + 3) / 4) * 4;
  const uint32_t pixelOffset = 54;
  const uint32_t imageSize = rowSize * h;
  const uint32_t fileSize = pixelOffset + imageSize;
  out.assign(fileSize, 0);

  out[0] = 'B';
  out[1] = 'M';
  putU32(&out[2], fileSize);
  putU32(&out[10], pixelOffset);
  putU32(&out[14], 40);
  putI32(&out[18], static_cast<int32_t>(w));
  putI32(&out[22], static_cast<int32_t>(h));
  putU16(&out[26], 1);
  putU16(&out[28], 24);
  putU32(&out[34], imageSize);

  uint8_t* dstPixels = out.data() + pixelOffset;
  for (uint32_t y = 0; y < h; y++) {
    const uint8_t* src = bgra + (h - 1 - y) * stride;
    uint8_t* dst = dstPixels + y * rowSize;
    for (uint32_t x = 0; x < w; x++) {
      dst[x * 3 + 0] = src[x * 4 + 0];
      dst[x * 3 + 1] = src[x * 4 + 1];
      dst[x * 3 + 2] = src[x * 4 + 2];
    }
  }
  return true;
}

static uint32_t getUint(Napi::Object obj, const char* key, uint32_t fallback = 1) {
  if (!obj.Has(key) || !obj.Get(key).IsNumber()) return fallback;
  uint32_t value = obj.Get(key).As<Napi::Number>().Uint32Value();
  return value == 0 ? fallback : value;
}

static void onRawVideo(void* /*param*/, struct video_data* frame) {
  if (!g_previewActive || !g_previewTsfn || !frame || !frame->data[0]) return;

  uint64_t now = os_gettime_ns();
  uint64_t last = g_lastFrameNs.load(std::memory_order_relaxed);
  if (now - last < g_minIntervalNs.load(std::memory_order_relaxed)) return;
  if (g_frameInFlight.exchange(true, std::memory_order_acq_rel)) return;
  g_lastFrameNs.store(now, std::memory_order_relaxed);

  auto* pf = new PreviewFrame();
  pf->width = g_previewWidth;
  pf->height = g_previewHeight;
  if (!encodeBgraToBmp(frame->data[0], pf->width, pf->height, frame->linesize[0], pf->image)) {
    delete pf;
    g_frameInFlight.store(false, std::memory_order_release);
    return;
  }

  napi_status status = g_previewTsfn.NonBlockingCall(pf,
    [](Napi::Env env, Napi::Function jsCallback, PreviewFrame* data) {
      auto buf = Napi::Buffer<uint8_t>::Copy(env, data->image.data(), data->image.size());
      auto obj = Napi::Object::New(env);
      obj.Set("mime", "image/bmp");
      obj.Set("width", data->width);
      obj.Set("height", data->height);
      obj.Set("data", buf);
      jsCallback.Call({obj});
      delete data;
      g_frameInFlight.store(false, std::memory_order_release);
    });
  if (status != napi_ok) {
    delete pf;
    g_frameInFlight.store(false, std::memory_order_release);
  }
}

void VsStopPreviewInternal() {
  if (g_previewActive.exchange(false)) {
    obs_remove_raw_video_callback(onRawVideo, nullptr);
  }
  if (g_previewTsfn) {
    g_previewTsfn.Release();
    g_previewTsfn = nullptr;
  }
  g_frameInFlight = false;
}

Napi::Value StartPreview(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::Error::New(env, "startPreview requires a callback").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  VsStopPreviewInternal();

  uint32_t width = 960, height = 540, fps = 30;
  if (info.Length() > 1 && info[1].IsObject()) {
    auto o = info[1].As<Napi::Object>();
    width = getUint(o, "width", width);
    height = getUint(o, "height", height);
    fps = getUint(o, "fps", fps);
  }
  if (fps < 1) fps = 1;
  if (fps > 30) fps = 30;
  g_previewWidth = width;
  g_previewHeight = height;
  g_minIntervalNs = 1000000000ULL / fps - 1000000ULL;

  g_previewTsfn = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "PreviewCallback", 1, 1);

  struct video_scale_info conversion = {};
  conversion.format = VIDEO_FORMAT_BGRA;
  conversion.width = width;
  conversion.height = height;
  conversion.range = VIDEO_RANGE_FULL;
  conversion.colorspace = VIDEO_CS_DEFAULT;

  g_lastFrameNs = 0;
  g_previewActive = true;
  obs_add_raw_video_callback(&conversion, onRawVideo, nullptr);
  return Napi::Boolean::New(env, true);
}

Napi::Value StopPreview(const Napi::CallbackInfo& info) {
  VsStopPreviewInternal();
  return Napi::Boolean::New(info.Env(), true);
}

#endif
