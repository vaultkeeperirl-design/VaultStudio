cmake_minimum_required(VERSION 3.22)
project(vaultstudio-obs LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

# Node.js headers from cmake-js
include_directories(${CMAKE_JS_INC})

# node-addon-api (napi.h C++ wrapper)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/node_modules/node-addon-api)

# OBS headers from pre-built deps
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../obs-deps/include)

# macOS ARM64: SIMDE headers for SSE2 emulation (installed via Homebrew)
if(APPLE)
  execute_process(
    COMMAND brew --prefix simde
    OUTPUT_VARIABLE SIMDE_PREFIX
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(SIMDE_PREFIX AND EXISTS "${SIMDE_PREFIX}/include")
    include_directories(${SIMDE_PREFIX}/include)
    message(STATUS "SIMDE headers found at ${SIMDE_PREFIX}/include")
  else()
    # Fallback: check standard Homebrew paths
    if(EXISTS "/opt/homebrew/include/simde")
      include_directories(/opt/homebrew/include)
      message(STATUS "SIMDE headers found at /opt/homebrew/include")
    elseif(EXISTS "/usr/local/include/simde")
      include_directories(/usr/local/include)
      message(STATUS "SIMDE headers found at /usr/local/include")
    endif()
  endif()
endif()

if(WIN32)
  set(VSS_RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../obs-runtime")
elseif(APPLE)
  if(DEFINED ENV{VSS_OBS_RUNTIME})
    set(VSS_RUNTIME_DIR "$ENV{VSS_OBS_RUNTIME}")
  else()
    set(VSS_RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../vss-runtime/darwin")
  endif()
else()
  if(DEFINED ENV{VSS_OBS_RUNTIME})
    set(VSS_RUNTIME_DIR "$ENV{VSS_OBS_RUNTIME}")
  else()
    set(VSS_RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../vss-runtime/linux")
  endif()
endif()

# Enable real libobs code
add_definitions(-DHAVE_LIBOBS)

# CMAKE_JS_SRC carries the win_delay_load_hook so the addon binds to whatever
# host executable loaded it (vaultstudio-engine.exe), not a literal "node.exe".
add_library(${PROJECT_NAME} SHARED
  addon.cc
  obs-core.cc
  obs-scenes.cc
  obs-output.cc
  obs-audio.cc
  obs-video.cc
  obs-events.cc
  ${CMAKE_JS_SRC}
)

if(WIN32)
  set(OBS_LIBRARY "${CMAKE_CURRENT_SOURCE_DIR}/../obs-deps/obs.lib")
elseif(APPLE)
  set(OBS_LIBRARY "")
  foreach(candidate
    "${VSS_RUNTIME_DIR}/Frameworks/libobs.framework/libobs"
    "${VSS_RUNTIME_DIR}/lib/libobs.dylib"
    "${VSS_RUNTIME_DIR}/Frameworks/libobs.dylib")
    if(EXISTS "${candidate}")
      set(OBS_LIBRARY "${candidate}")
      break()
    endif()
  endforeach()
else()
  set(OBS_LIBRARY "")
  foreach(candidate
    "${VSS_RUNTIME_DIR}/lib/libobs.so"
    "${VSS_RUNTIME_DIR}/lib/x86_64-linux-gnu/libobs.so"
    "${VSS_RUNTIME_DIR}/lib/aarch64-linux-gnu/libobs.so")
    if(EXISTS "${candidate}")
      set(OBS_LIBRARY "${candidate}")
      break()
    endif()
  endforeach()
endif()

if(NOT EXISTS "${OBS_LIBRARY}")
  message(FATAL_ERROR "libobs library not found for this platform. Expected runtime at ${VSS_RUNTIME_DIR}")
endif()

target_link_libraries(${PROJECT_NAME} PRIVATE
  ${CMAKE_JS_LIB}
  "${OBS_LIBRARY}"
)

if(APPLE)
  set_target_properties(${PROJECT_NAME} PROPERTIES
    BUILD_WITH_INSTALL_RPATH TRUE
    INSTALL_RPATH "@loader_path/../vss-runtime/darwin/Frameworks;@loader_path/../vss-runtime/darwin/lib"
  )
elseif(UNIX)
  set_target_properties(${PROJECT_NAME} PROPERTIES
    BUILD_WITH_INSTALL_RPATH TRUE
    INSTALL_RPATH "$ORIGIN/../vss-runtime/linux/lib"
  )
endif()

# Windows libs required by libobs
if(WIN32)
  target_link_libraries(${PROJECT_NAME} PRIVATE
    ws2_32
    user32
    gdi32
    winmm
    shlwapi
    kernel32
    advapi32
    ole32
    oleaut32
  )
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)
