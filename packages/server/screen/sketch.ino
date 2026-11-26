// New project: a counter button on the built-in screen. Ask Claude to replace this with your project.
#include "Screen.h"

static lv_obj_t *label;
static int presses = 0;

static void pressed(lv_event_t *) {
  lv_label_set_text_fmt(label, "Pressed %d times", ++presses);
}

void setup() {
  Screen.begin();

  lv_obj_t *title = lv_label_create(lv_screen_active());
  lv_label_set_text(title, "MicroManager");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_24, 0);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 20);

  lv_obj_t *btn = lv_button_create(lv_screen_active());
  lv_obj_set_size(btn, 160, 60);
  lv_obj_center(btn);
  lv_obj_add_event_cb(btn, pressed, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *text = lv_label_create(btn);
  lv_label_set_text(text, "Press me");
  lv_obj_center(text);

  label = lv_label_create(lv_screen_active());
  lv_label_set_text(label, "Not pressed yet");
  lv_obj_align(label, LV_ALIGN_BOTTOM_MID, 0, -20);
}

void loop() {
  Screen.loop();
}
