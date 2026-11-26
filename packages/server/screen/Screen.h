// Screen: the board's built-in display and touch, ready for LVGL. Part of the app, refreshed on every
// build: don't edit it, and don't set up the display or touch yourself.
//
//   #include "Screen.h"
//   void setup() { Screen.begin(); ui(); }   // build the UI with lv_* calls after begin()
//   void loop()  { Screen.loop(); ... }      // call often; never block for long
//
// - The display is landscape (320 x 240 on the Cheap Yellow Display): Screen.begin(0) for portrait.
// - LVGL 9 with Montserrat 12-48 fonts (lv_font_montserrat_12, 14, 16, 20, 24, 32, 48); default 14.
// - Screen.brightness(0..255) dims the backlight; Screen.gfx() is the LovyanGFX device for drawing
//   outside LVGL (rarely needed).
// - Serial is open at 115200 for debug prints.
#pragma once
#include <Arduino.h>

#define LGFX_ESP32_2432S028  // board: set by the app
#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <LGFX_AUTODETECT.hpp>  // only the board above is probed
#include <lvgl.h>

class ScreenClass {
 public:
  void begin(uint8_t rotation = 1) {
    Serial.begin(115200);
    gfx_.init();
    gfx_.setRotation(rotation);
    gfx_.setBrightness(255);
    lv_init();
    lv_tick_set_cb(tick);
    disp_ = lv_display_create(gfx_.width(), gfx_.height());
    lv_display_set_flush_cb(disp_, flush);
    lv_display_set_buffers(disp_, buf_, nullptr, sizeof(buf_), LV_DISPLAY_RENDER_MODE_PARTIAL);
    indev_ = lv_indev_create();
    lv_indev_set_type(indev_, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(indev_, touch);
  }

  void loop() { lv_timer_handler(); }

  void brightness(uint8_t level) { gfx_.setBrightness(level); }
  LGFX &gfx() { return gfx_; }
  lv_display_t *display() { return disp_; }

 private:
  static inline LGFX gfx_;
  static inline uint8_t buf_[320 * 24 * 2];  // 24 lines of RGB565 per flush
  lv_display_t *disp_ = nullptr;
  lv_indev_t *indev_ = nullptr;

  static uint32_t tick() { return millis(); }

  static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *px) {
    gfx_.startWrite();
    gfx_.pushImage(a->x1, a->y1, lv_area_get_width(a), lv_area_get_height(a), (lgfx::rgb565_t *)px);
    gfx_.endWrite();
    lv_display_flush_ready(d);
  }

  static void touch(lv_indev_t *, lv_indev_data_t *data) {
    int32_t x, y;
    if (gfx_.getTouch(&x, &y)) {
      data->point.x = x;
      data->point.y = y;
      data->state = LV_INDEV_STATE_PRESSED;
    } else {
      data->state = LV_INDEV_STATE_RELEASED;
    }
  }
};

inline ScreenClass Screen;
