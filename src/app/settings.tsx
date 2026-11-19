import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { GoogleCalendarCard } from "@/components/google-calendar-card";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/screen";
import { Segmented } from "@/components/ui/segmented";
import { VersionInfoCard } from "@/components/version-info-card";
import { MaxContentWidth, Radius, Spacing } from "@/constants/theme";
import { useTheme, useThemeMode, type ThemeMode } from "@/hooks/use-theme";
import { exitDevMode, useAuth } from "@/lib/auth";
import { confirm, errorMessage } from "@/lib/format";
import { clearLocalDb } from "@/lib/local-db";
import { queryClient } from "@/lib/query";
import { supabase } from "@/lib/supabase";

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "다크" },
  { value: "light", label: "라이트" },
  { value: "system", label: "기기 설정 따름" },
];

/** 로그인 방법 이름 (Supabase 가 알려주는 provider 값 → 화면 글자) */
const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
  email: "이메일",
};

/**
 * 설정 화면. 위에서부터 [내 계정] [화면] [알림] [앱 정보] 순서로 놓는다.
 * 화면 오른쪽 위의 "설정" 버튼으로 연다.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { mode, resolvedScheme, setMode } = useThemeMode();
  const { session, isDevMode } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user.email ?? null;
  const provider = session?.user.app_metadata?.provider as string | undefined;
  const providerLabel = provider
    ? (PROVIDER_LABEL[provider] ?? provider)
    : null;
  // 동그란 프로필 칸에 넣을 첫 글자
  const initial = isDevMode ? "개" : (email ?? "멀").charAt(0).toUpperCase();

  async function signOut() {
    const ok = await confirm(
      isDevMode
        ? {
            title: "개발 모드를 종료할까요?",
            message:
              "기기에 저장된 할 일과 가계부 등 데이터는 그대로 남아 있어, 나중에 다시 이어서 쓸 수 있어요.",
            confirmLabel: "종료",
            destructive: false,
          }
        : {
            title: "로그아웃할까요?",
            message:
              "데이터는 계정에 그대로 저장되어 있어서, 다시 로그인하면 이어서 쓸 수 있어요.",
            confirmLabel: "로그아웃",
            destructive: false,
          },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    if (isDevMode) {
      await exitDevMode();
      setBusy(false);
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) setError(errorMessage(signOutError));
  }

  async function resetDevData() {
    const ok = await confirm({
      title: "기기 내 개발 데이터를 초기화할까요?",
      message:
        "기기에 저장된 할 일, 가계부, 일정, 습관, 메모, 태그가 모두 삭제됩니다.",
      confirmLabel: "초기화",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await clearLocalDb();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Section title="내 계정">
        <Card>
          <View style={styles.profile}>
            <View style={[styles.avatar, { backgroundColor: theme.tintSoft }]}>
              <ThemedText
                type="default"
                style={[styles.avatarText, { color: theme.tint }]}
              >
                {initial}
              </ThemedText>
            </View>
            <View style={styles.profileText}>
              <ThemedText type="default" numberOfLines={1} style={styles.email}>
                {isDevMode
                  ? "개발 모드 (기기 내 저장)"
                  : (email ?? "로그인된 계정")}
              </ThemedText>
              {isDevMode ? (
                <ThemedText type="small" themeColor="textSecondary">
                  로그인 없이 로컬 저장소 사용 중
                </ThemedText>
              ) : providerLabel ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`${providerLabel}로 로그인함`}
                </ThemedText>
              ) : null}
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {isDevMode
              ? "할 일, 일정, 습관, 메모, 가계부가 서버 전송 없이 이 기기에만 저장됩니다."
              : "할 일, 일정, 습관, 메모, 가계부는 이 계정에 저장되어 웹과 휴대폰에서 함께 보여요."}
          </ThemedText>
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <Button
            label={isDevMode ? "개발 모드 종료" : "로그아웃"}
            variant="secondary"
            size="small"
            onPress={signOut}
            loading={busy}
          />
          {isDevMode ? (
            <Button
              label="기기 내 데이터 초기화"
              variant="danger"
              size="small"
              onPress={resetDevData}
              disabled={busy}
            />
          ) : null}
        </Card>
      </Section>

      <Section title="화면">
        <Card>
          <ThemedText type="default" style={styles.cardTitle}>
            테마
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {mode === "system"
              ? `기기 설정을 따라 지금은 ${resolvedScheme === "dark" ? "다크" : "라이트"} 모드예요.`
              : `${resolvedScheme === "dark" ? "다크" : "라이트"} 모드로 고정돼 있어요.`}
          </ThemedText>
          <Segmented options={THEME_OPTIONS} value={mode} onChange={setMode} />
        </Card>
      </Section>

      <Section title="알림">
        <NotificationSettingsCard />
      </Section>

      <Section title="연동">
        <GoogleCalendarCard />
      </Section>

      <Section title="앱 정보">
        <VersionInfoCard />
      </Section>
    </ScrollView>
  );
}

/** 회색 작은 제목 아래에 상자를 놓는 묶음 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText
        type="smallBold"
        themeColor="textSecondary"
        style={styles.sectionTitle}
      >
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.one,
  },
  cardTitle: {
    fontWeight: 700,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 700,
  },
  profileText: {
    flex: 1,
    gap: Spacing.half,
  },
  email: {
    fontWeight: 700,
  },
});
