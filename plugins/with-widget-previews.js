const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');

function toAndroidResourceName(name) {
  const resourceName = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return /^[a-z]/.test(resourceName) ? resourceName : `widget_${resourceName}`;
}

const LIGHT_COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="widget_bg">#FFFFFF</color>
  <color name="widget_surface">#F4F5FA</color>
  <color name="widget_border">#E3E4F0</color>
  <color name="widget_text">#171626</color>
  <color name="widget_text_secondary">#6B6C84</color>
  <color name="widget_tint">#6354EA</color>
  <color name="widget_tint_soft">#EEECFD</color>
  <color name="widget_warm">#D9820B</color>
  <color name="widget_success">#0E9F6E</color>
  <color name="widget_danger">#D92D46</color>
</resources>
`;

const DARK_COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="widget_bg">#1F1E2E</color>
  <color name="widget_surface">#2B2A40</color>
  <color name="widget_border">#2E2D45</color>
  <color name="widget_text">#F5F5FA</color>
  <color name="widget_text_secondary">#8F8FA8</color>
  <color name="widget_tint">#9B8AFB</color>
  <color name="widget_tint_soft">#282447</color>
  <color name="widget_warm">#F5A623</color>
  <color name="widget_success">#4ADE80</color>
  <color name="widget_danger">#FF7B8B</color>
</resources>
`;

const DRAWABLES = {
  'widget_preview_bg.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@color/widget_bg" />
  <stroke android:width="1dp" android:color="@color/widget_border" />
  <corners android:radius="18dp" />
</shape>
`,
  'widget_preview_surface.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@color/widget_surface" />
  <corners android:radius="10dp" />
</shape>
`,
  'widget_preview_tint_pill.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@color/widget_tint_soft" />
  <corners android:radius="99dp" />
</shape>
`,
  'widget_preview_dot_tint.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="@color/widget_tint" />
</shape>
`,
  'widget_preview_dot_warm.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="@color/widget_warm" />
</shape>
`,
  'widget_preview_dot_success.xml': `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="@color/widget_success" />
</shape>
`,
};

const PREVIEW_LAYOUTS = {
  TodoWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_vertical"
    android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_tint" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:text="할 일" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="3개 남음" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="10dp" android:background="@drawable/widget_preview_surface" android:gravity="center_vertical" android:orientation="horizontal" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="☐" android:textColor="@color/widget_text_secondary" android:textSize="13sp" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="8dp" android:layout_weight="1" android:text="장보기 (우유, 계란)" android:textColor="@color/widget_text" android:textSize="13sp" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="오늘" android:textColor="@color/widget_tint" android:textSize="10sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:background="@drawable/widget_preview_surface" android:gravity="center_vertical" android:orientation="horizontal" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="☐" android:textColor="@color/widget_text_secondary" android:textSize="13sp" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="8dp" android:layout_weight="1" android:text="회의 자료 정리하기" android:textColor="@color/widget_text" android:textSize="13sp" />
  </LinearLayout>
</LinearLayout>
`,
  EventsWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_warm" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:text="일정" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="2건" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="10dp" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="팀 주간 미팅" android:textColor="@color/widget_text" android:textSize="13sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="10:00 – 11:00" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="치과 예약" android:textColor="@color/widget_text" android:textSize="13sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="15:30" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
  </LinearLayout>
</LinearLayout>
`,
  NotesWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_tint" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:text="메모" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="2개" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="10dp" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="📌 이번 주 목표" android:textColor="@color/widget_text" android:textSize="13sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="매일 물 2L 마시기, 책 20페이지 읽기" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="아이디어 메모" android:textColor="@color/widget_text" android:textSize="13sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="주말 나들이 준비물 체크리스트" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
  </LinearLayout>
</LinearLayout>
`,
  HabitsWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_success" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:text="습관" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="2/3" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="10dp" android:background="@drawable/widget_preview_surface" android:gravity="center_vertical" android:orientation="horizontal" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="✓" android:textColor="@color/widget_success" android:textSize="13sp" android:textStyle="bold" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="8dp" android:layout_weight="1" android:text="아침 스트레칭" android:textColor="@color/widget_text_secondary" android:textSize="13sp" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="🔥 7일" android:textColor="@color/widget_warm" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:background="@drawable/widget_preview_surface" android:gravity="center_vertical" android:orientation="horizontal" android:paddingHorizontal="10dp" android:paddingVertical="8dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="○" android:textColor="@color/widget_text_secondary" android:textSize="13sp" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="8dp" android:layout_weight="1" android:text="영단어 10개" android:textColor="@color/widget_text" android:textSize="13sp" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="🔥 4일" android:textColor="@color/widget_warm" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>
</LinearLayout>
`,
  MoneyWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_tint" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:layout_weight="1" android:text="이번 달 가계부" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="오늘 14,500원" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="10dp" android:orientation="horizontal">
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="10dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="지출" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="428,000원" android:textColor="@color/widget_danger" android:textSize="14sp" android:textStyle="bold" />
    </LinearLayout>
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="8dp" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="10dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="수입" android:textColor="@color/widget_text_secondary" android:textSize="11sp" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="2,800,000원" android:textColor="@color/widget_success" android:textSize="14sp" android:textStyle="bold" />
    </LinearLayout>
  </LinearLayout>

  <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginTop="8dp" android:text="남은 예산 372,000원" android:textColor="@color/widget_text_secondary" android:textSize="11sp" android:textStyle="bold" />
</LinearLayout>
`,
  DashboardWidget: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_preview_bg"
  android:padding="14dp">

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:orientation="horizontal">
    <ImageView android:layout_width="8dp" android:layout_height="8dp" android:background="@drawable/widget_preview_dot_tint" />
    <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:layout_weight="1" android:text="멀어서 · 오늘" android:textColor="@color/widget_text" android:textSize="15sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:background="@drawable/widget_preview_tint_pill" android:paddingHorizontal="7dp" android:paddingVertical="2dp" android:text="할 일 2 · 일정 2" android:textColor="@color/widget_tint" android:textSize="10sp" android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="8dp" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="10dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="할 일" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginTop="3dp" android:text="☐ 장보기 (우유, 계란)" android:textColor="@color/widget_text" android:textSize="12sp" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="☐ 회의 자료 정리" android:textColor="@color/widget_text" android:textSize="12sp" />
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:orientation="horizontal">
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="8dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="일정 (2)" android:textColor="@color/widget_warm" android:textSize="11sp" android:textStyle="bold" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="10:00 팀 주간 미팅" android:textColor="@color/widget_text" android:textSize="11sp" />
    </LinearLayout>
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="8dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="습관 (2/3)" android:textColor="@color/widget_success" android:textSize="11sp" android:textStyle="bold" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="✓ 아침 스트레칭" android:textColor="@color/widget_text" android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="6dp" android:orientation="horizontal">
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="8dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="메모" android:textColor="@color/widget_tint" android:textSize="11sp" android:textStyle="bold" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="📌 이번 주 목표" android:textColor="@color/widget_text" android:textSize="11sp" />
    </LinearLayout>
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:layout_weight="1" android:background="@drawable/widget_preview_surface" android:orientation="vertical" android:padding="8dp">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="가계부" android:textColor="@color/widget_danger" android:textSize="11sp" android:textStyle="bold" />
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="이번 달 428,000원" android:textColor="@color/widget_text" android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>
</LinearLayout>
`,
};

module.exports = function withWidgetPreviews(config) {
  return withFinalizedMod(config, [
    'android',
    async (modConfig) => {
      const resRoot = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res');
      const valuesDir = path.join(resRoot, 'values');
      const valuesNightDir = path.join(resRoot, 'values-night');
      const drawableDir = path.join(resRoot, 'drawable');
      const layoutDir = path.join(resRoot, 'layout');
      const xmlDir = path.join(resRoot, 'xml');

      fs.mkdirSync(valuesDir, { recursive: true });
      fs.mkdirSync(valuesNightDir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(layoutDir, { recursive: true });

      fs.writeFileSync(path.join(valuesDir, 'widget_preview_colors.xml'), LIGHT_COLORS_XML);
      fs.writeFileSync(path.join(valuesNightDir, 'widget_preview_colors.xml'), DARK_COLORS_XML);

      for (const [fileName, content] of Object.entries(DRAWABLES)) {
        fs.writeFileSync(path.join(drawableDir, fileName), content);
      }

      for (const [widgetName, layoutXml] of Object.entries(PREVIEW_LAYOUTS)) {
        const snake = toAndroidResourceName(widgetName);
        const previewLayoutName = `widget_preview_${snake}`;
        fs.writeFileSync(path.join(layoutDir, `${previewLayoutName}.xml`), layoutXml);

        const infoPath = path.join(xmlDir, `${snake}_info.xml`);
        if (fs.existsSync(infoPath)) {
          let infoXml = fs.readFileSync(infoPath, 'utf8');
          if (!infoXml.includes('android:previewLayout=')) {
            infoXml = infoXml.replace(
              'android:initialLayout="@layout/expo_widgets_initial_layout"',
              `android:initialLayout="@layout/expo_widgets_initial_layout"\n  android:previewLayout="@layout/${previewLayoutName}"`,
            );
            fs.writeFileSync(infoPath, infoXml);
          }
        }
      }

      return modConfig;
    },
  ]);
};
