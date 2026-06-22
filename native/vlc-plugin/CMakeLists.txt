cmake_minimum_required(VERSION 3.22)
project(vlc-video LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")

# pthreads-win32's pthread.h otherwise tries to redefine struct timespec,
# which MSVC's <time.h> already provides.
add_definitions(-DHAVE_STRUCT_TIMESPEC -D_CRT_SECURE_NO_WARNINGS)

include_directories(
  ${CMAKE_CURRENT_SOURCE_DIR}/../obs-deps/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../vlc-deps/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../vendor/obs-studio/deps/w32-pthreads
)

add_library(vlc-video SHARED
  vlc-video-plugin.c
  vlc-video-source.c
)

target_link_libraries(vlc-video PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../obs-deps/obs.lib
  ${CMAKE_CURRENT_SOURCE_DIR}/w32-pthreads.lib
  winmm
  user32
)

set_target_properties(vlc-video PROPERTIES PREFIX "" SUFFIX ".dll")
